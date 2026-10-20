import asyncio
from collections.abc import AsyncIterator

import pytest

from app.schemas.common import ModelSelection
from app.services.compare import run_comparison
from app.services.llm import MissingAPIKeyError, UpstreamError


def selection(model: str) -> ModelSelection:
    return ModelSelection(provider="groq", model=model)


@pytest.mark.asyncio
async def test_merge_runs_both_sides_concurrently() -> None:
    both_started = asyncio.Event()
    started_count = 0

    async def factory(selected: ModelSelection, prompt: str) -> AsyncIterator[str]:
        nonlocal started_count
        started_count += 1
        if started_count == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)
        for part in ["Hello", " ", selected.model]:
            await asyncio.sleep(0)
            yield part

    events = [
        event
        async for event in run_comparison(
            "prompt",
            selection("a"),
            selection("b"),
            stream_factory=factory,
        )
    ]

    starts = [event for event in events if event.type == "start"]
    done = [event for event in events if event.type == "done"]
    deltas = [event for event in events if event.type == "delta"]

    assert {event.side for event in starts} == {"a", "b"}
    assert {event.side for event in done} == {"a", "b"}
    assert any(event.text == "a" for event in deltas)
    assert any(event.text == "b" for event in deltas)
    assert not [event for event in events if event.type == "error"]
    for event in done:
        assert event.output_chars > 0
        assert event.total_ms >= 0
        assert event.ttft_ms >= 0


@pytest.mark.asyncio
async def test_one_failing_side_does_not_break_the_other() -> None:
    async def factory(selected: ModelSelection, prompt: str) -> AsyncIterator[str]:
        if selected.model == "fail":
            yield "partial"
            raise UpstreamError(
                "Rate limit reached for this model. Try again shortly.",
                status_code=429,
            )
        for part in ["The", " answer", " is", " 42"]:
            await asyncio.sleep(0)
            yield part

    events = [
        event
        async for event in run_comparison(
            "prompt",
            selection("good"),
            selection("fail"),
            stream_factory=factory,
        )
    ]

    errors = [event for event in events if event.type == "error"]
    done = [event for event in events if event.type == "done"]
    assert len(errors) == 1
    assert errors[0].side == "b"
    assert "Rate limit" in errors[0].message
    assert len(done) == 1
    assert done[0].side == "a"
    assert done[0].output_chars == len("The answer is 42")


@pytest.mark.asyncio
async def test_missing_key_is_a_per_side_error() -> None:
    async def factory(selected: ModelSelection, prompt: str) -> AsyncIterator[str]:
        if selected.model == "missing":
            raise MissingAPIKeyError("gemini")
        yield "ok"

    events = [
        event
        async for event in run_comparison(
            "prompt",
            selection("ok"),
            selection("missing"),
            stream_factory=factory,
        )
    ]

    assert any(event.type == "start" and event.side == "b" for event in events)
    errors = [event for event in events if event.type == "error"]
    assert len(errors) == 1
    assert errors[0].side == "b"
    assert "not configured" in errors[0].message
    assert any(event.type == "done" and event.side == "a" for event in events)


@pytest.mark.asyncio
async def test_cancellation_stops_both_upstream_streams() -> None:
    cancelled: set[str] = set()

    async def factory(selected: ModelSelection, prompt: str) -> AsyncIterator[str]:
        try:
            yield "first"
            await asyncio.sleep(60)
        finally:
            cancelled.add(selected.model)

    generator = run_comparison(
        "prompt",
        selection("a"),
        selection("b"),
        stream_factory=factory,
    )
    await anext(generator)
    await generator.aclose()
    await asyncio.sleep(0.01)

    assert cancelled == {"a", "b"}
