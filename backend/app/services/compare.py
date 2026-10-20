"""Run two model streams concurrently and merge their events."""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from time import perf_counter

from app.schemas.common import ModelSelection, Side
from app.schemas.compare import DeltaEvent, DoneEvent, ErrorEvent, StartEvent
from app.services.llm import LLMError
from app.services.stream import model_text_stream

logger = logging.getLogger(__name__)

CompareEvent = StartEvent | DeltaEvent | DoneEvent | ErrorEvent
TextStreamFactory = Callable[[ModelSelection, str], AsyncIterator[str]]


async def _run_side(
    *,
    side: Side,
    selection: ModelSelection,
    prompt: str,
    queue: asyncio.Queue[CompareEvent | None],
    stream_factory: TextStreamFactory,
    request_id: str,
) -> None:
    """Stream one side, isolating every failure to that side."""
    queue.put_nowait(StartEvent(side=side))
    started = perf_counter()
    first_token_at: float | None = None
    output_chars = 0

    try:
        async for text in stream_factory(selection, prompt):
            if not text:
                continue
            now = perf_counter()
            if first_token_at is None:
                first_token_at = now
            output_chars += len(text)
            queue.put_nowait(DeltaEvent(side=side, text=text))

        total_ms = round((perf_counter() - started) * 1000)
        ttft_ms = (
            round((first_token_at - started) * 1000)
            if first_token_at is not None
            else total_ms
        )
        queue.put_nowait(
            DoneEvent(
                side=side,
                ttft_ms=ttft_ms,
                total_ms=total_ms,
                output_chars=output_chars,
            )
        )
        logger.info(
            "compare.side.finished",
            extra={
                "event": "compare.side.finished",
                "request_id": request_id,
                "side": side,
                "provider": selection.provider,
                "model": selection.model,
                "ttft_ms": ttft_ms,
                "total_ms": total_ms,
                "output_chars": output_chars,
                "outcome": "done",
            },
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        message = (
            exc.user_message
            if isinstance(exc, LLMError)
            else "Something went wrong while generating a response."
        )
        queue.put_nowait(ErrorEvent(side=side, message=message))
        logger.warning(
            "compare.side.failed",
            extra={
                "event": "compare.side.failed",
                "request_id": request_id,
                "side": side,
                "provider": selection.provider,
                "model": selection.model,
                "total_ms": round((perf_counter() - started) * 1000),
                "outcome": "error",
                "error_type": type(exc).__name__,
                "status_code": getattr(exc, "status_code", None),
            },
        )
    finally:
        queue.put_nowait(None)


async def run_comparison(
    prompt: str,
    a: ModelSelection,
    b: ModelSelection,
    *,
    request_id: str = "",
    stream_factory: TextStreamFactory = model_text_stream,
) -> AsyncIterator[CompareEvent]:
    """Yield interleaved events for two concurrent model streams.

    The response generator always waits for both sides. If the consumer stops
    early, both upstream tasks are cancelled and awaited.
    """
    queue: asyncio.Queue[CompareEvent | None] = asyncio.Queue()
    tasks = [
        asyncio.create_task(
            _run_side(
                side="a",
                selection=a,
                prompt=prompt,
                queue=queue,
                stream_factory=stream_factory,
                request_id=request_id,
            ),
            name=f"compare-{request_id}-a",
        ),
        asyncio.create_task(
            _run_side(
                side="b",
                selection=b,
                prompt=prompt,
                queue=queue,
                stream_factory=stream_factory,
                request_id=request_id,
            ),
            name=f"compare-{request_id}-b",
        ),
    ]

    remaining = len(tasks)
    try:
        while remaining:
            event = await queue.get()
            if event is None:
                remaining -= 1
                continue
            yield event
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
