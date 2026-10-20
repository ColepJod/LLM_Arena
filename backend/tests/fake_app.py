"""Test-only app that exercises the real merge logic without API keys.

Run from the backend directory:

    uv run uvicorn tests.fake_app:app --port 8000
"""

import asyncio
from collections.abc import AsyncIterator

import app.api.routes.compare as compare_route
from app.main import app
from app.schemas.common import ModelSelection
from app.services.compare import run_comparison
from app.services.llm import UpstreamError


async def fake_text_stream(
    selection: ModelSelection,
    prompt: str,
) -> AsyncIterator[str]:
    if selection.model.endswith("fail") or selection.provider == "gemini":
        yield "This side starts, then fails. "
        await asyncio.sleep(0.15)
        raise UpstreamError(
            "Rate limit reached for this model. Try again shortly or choose "
            "another model.",
            status_code=429,
        )

    words = [
        "This ",
        "is ",
        "a ",
        "fake ",
        "streamed ",
        "response ",
        "for ",
        f"{selection.provider}/",
        "from ",
        "the ",
        "test ",
        "server.",
    ]
    for word in words:
        await asyncio.sleep(0.08)
        yield word


async def fake_run_comparison(
    prompt: str,
    a: ModelSelection,
    b: ModelSelection,
    *,
    request_id: str = "",
) -> AsyncIterator[object]:
    async for event in run_comparison(
        prompt,
        a,
        b,
        request_id=request_id,
        stream_factory=fake_text_stream,
    ):
        yield event


compare_route.run_comparison = fake_run_comparison  # type: ignore[assignment]

__all__ = ["app"]
