"""Run two model streams concurrently and merge their events."""

import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from time import perf_counter

from app.schemas.common import ModelSelection, Side
from app.schemas.compare import (
    DeltaEvent,
    DoneEvent,
    ErrorEvent,
    ResearchEvent,
    StartEvent,
)
from app.schemas.compare import (
    ResearchSource as ResearchSourceInfo,
)
from app.services.llm import LLMError
from app.services.research import (
    ResearchSource,
    build_research_prompt,
    needs_live_research,
    search_live_web,
)
from app.services.stream import model_text_stream

logger = logging.getLogger(__name__)

CompareEvent = StartEvent | DeltaEvent | DoneEvent | ErrorEvent | ResearchEvent
TextStreamFactory = Callable[[ModelSelection, str], AsyncIterator[str]]
ResearchFactory = Callable[[str], Awaitable[list[ResearchSource]]]


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
    research_enabled: bool = False,
    stream_factory: TextStreamFactory = model_text_stream,
    research_factory: ResearchFactory = search_live_web,
) -> AsyncIterator[CompareEvent]:
    """Yield research and interleaved events for two concurrent model streams.

    When live research is enabled and the prompt is time-sensitive, Tavily
    results are fetched once and added to both model prompts. Research failures
    never stop the comparison.

    The response generator always waits for both sides. If the consumer stops
    early, both upstream tasks are cancelled and awaited.
    """
    model_prompt = prompt
    if research_enabled and needs_live_research(prompt):
        yield ResearchEvent(status="searching", query=prompt)
        logger.info(
            "compare.research.started",
            extra={
                "event": "compare.research.started",
                "request_id": request_id,
                "outcome": "searching",
            },
        )
        try:
            sources = await research_factory(prompt)
        except Exception as exc:
            logger.warning(
                "compare.research.failed",
                extra={
                    "event": "compare.research.failed",
                    "request_id": request_id,
                    "outcome": "error",
                    "error_type": type(exc).__name__,
                },
            )
            yield ResearchEvent(
                status="error",
                query=prompt,
                message=(
                    "Live web search is unavailable. The models will answer "
                    "without fresh sources."
                ),
            )
        else:
            if sources:
                model_prompt = build_research_prompt(prompt, sources)
                yield ResearchEvent(
                    status="done",
                    query=prompt,
                    sources=[
                        ResearchSourceInfo(title=source.title, url=source.url)
                        for source in sources
                    ],
                )
                logger.info(
                    "compare.research.finished",
                    extra={
                        "event": "compare.research.finished",
                        "request_id": request_id,
                        "outcome": "done",
                        "source_count": len(sources),
                    },
                )
            else:
                logger.info(
                    "compare.research.empty",
                    extra={
                        "event": "compare.research.empty",
                        "request_id": request_id,
                        "outcome": "empty",
                        "source_count": 0,
                    },
                )
                yield ResearchEvent(
                    status="error",
                    query=prompt,
                    message=(
                        "No recent web results were found. The models will "
                        "answer without fresh sources."
                    ),
                )

    queue: asyncio.Queue[CompareEvent | None] = asyncio.Queue()
    tasks = [
        asyncio.create_task(
            _run_side(
                side="a",
                selection=a,
                prompt=model_prompt,
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
                prompt=model_prompt,
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
