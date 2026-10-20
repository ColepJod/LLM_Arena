from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest

from app.schemas.common import ModelSelection
from app.services.compare import run_comparison
from app.services.research import (
    ResearchSource,
    build_research_prompt,
    needs_live_research,
    parse_tavily_results,
)


def selection(model: str) -> ModelSelection:
    return ModelSelection(provider="groq", model=model)


@pytest.mark.parametrize(
    "prompt",
    [
        "What is the latest sports news?",
        "Who won the game last night?",
        "What are today's scores?",
        "What is the weather forecast for tomorrow?",
        "What happened in the 2026 election?",
        "What is the current price of Bitcoin?",
    ],
)
def test_time_sensitive_prompts_use_research(prompt: str) -> None:
    assert needs_live_research(prompt)


@pytest.mark.parametrize(
    "prompt",
    [
        "Explain recursion with a small example.",
        "Write a Python function that reverses a string.",
        "What is the capital of France?",
    ],
)
def test_general_prompts_skip_research(prompt: str) -> None:
    assert not needs_live_research(prompt)


def test_parse_tavily_results_filters_and_sanitizes() -> None:
    sources = parse_tavily_results(
        {
            "results": [
                {
                    "title": "<b>Live score</b>",
                    "url": "https://example.com/score",
                    "content": "  Team A  2 - 1 Team B  ",
                },
                {
                    "title": "Bad URL",
                    "url": "javascript:alert(1)",
                    "content": "ignored",
                },
                {
                    "title": "",
                    "url": "https://example.org/news",
                    "content": "",
                },
            ]
        }
    )

    assert len(sources) == 2
    assert sources[0].title == "\u2039b\u203aLive score\u2039/b\u203a"
    assert sources[0].snippet == "Team A 2 - 1 Team B"
    assert sources[1].title == "example.org"


def test_build_research_prompt_includes_sources_and_timestamp() -> None:
    prompt = build_research_prompt(
        "Who won?",
        [
            ResearchSource(
                title="Final score",
                url="https://example.com/final",
                snippet="Team A won 2-1.",
            )
        ],
        now=datetime(2026, 10, 20, 12, 30, tzinfo=UTC),
    )

    assert "2026-10-20 12:30 UTC" in prompt
    assert "https://example.com/final" in prompt
    assert "Team A won 2-1." in prompt
    assert "untrusted reference data" in prompt
    assert prompt.endswith("Who won?")


@pytest.mark.asyncio
async def test_research_events_precede_streams_and_augment_both_prompts() -> None:
    captured: list[str] = []

    async def stream_factory(
        selected: ModelSelection, prompt: str
    ) -> AsyncIterator[str]:
        captured.append(prompt)
        yield "ok"

    async def research_factory(query: str) -> list[ResearchSource]:
        assert query == "What are the latest football scores?"
        return [
            ResearchSource(
                title="Live scores",
                url="https://example.com/scores",
                snippet="Arsenal 2-1 Chelsea.",
            )
        ]

    events = [
        event
        async for event in run_comparison(
            "What are the latest football scores?",
            selection("a"),
            selection("b"),
            research_enabled=True,
            stream_factory=stream_factory,
            research_factory=research_factory,
        )
    ]

    assert events[0].type == "research"
    assert events[0].status == "searching"
    assert events[1].type == "research"
    assert events[1].status == "done"
    assert events[1].sources[0].url == "https://example.com/scores"
    assert len(captured) == 2
    assert all("https://example.com/scores" in prompt for prompt in captured)
    assert all("untrusted reference data" in prompt for prompt in captured)
    assert len([event for event in events if event.type == "done"]) == 2


@pytest.mark.asyncio
async def test_research_failure_does_not_stop_model_streams() -> None:
    async def stream_factory(
        selected: ModelSelection, prompt: str
    ) -> AsyncIterator[str]:
        yield "answer"

    async def research_factory(query: str) -> list[ResearchSource]:
        raise RuntimeError("upstream failure")

    events = [
        event
        async for event in run_comparison(
            "What is the latest news?",
            selection("a"),
            selection("b"),
            research_enabled=True,
            stream_factory=stream_factory,
            research_factory=research_factory,
        )
    ]

    research_errors = [
        event
        for event in events
        if event.type == "research" and event.status == "error"
    ]
    assert len(research_errors) == 1
    assert "without fresh sources" in (research_errors[0].message or "")
    assert len([event for event in events if event.type == "done"]) == 2
    assert not [event for event in events if event.type == "error"]


@pytest.mark.asyncio
async def test_research_is_skipped_when_disabled_or_not_needed() -> None:
    calls = 0

    async def stream_factory(
        selected: ModelSelection, prompt: str
    ) -> AsyncIterator[str]:
        yield "answer"

    async def research_factory(query: str) -> list[ResearchSource]:
        nonlocal calls
        calls += 1
        return []

    disabled_events = [
        event
        async for event in run_comparison(
            "What is the latest news?",
            selection("a"),
            selection("b"),
            research_enabled=False,
            stream_factory=stream_factory,
            research_factory=research_factory,
        )
    ]
    general_events = [
        event
        async for event in run_comparison(
            "Explain recursion",
            selection("a"),
            selection("b"),
            research_enabled=True,
            stream_factory=stream_factory,
            research_factory=research_factory,
        )
    ]

    assert not [event for event in disabled_events if event.type == "research"]
    assert not [event for event in general_events if event.type == "research"]
    assert calls == 0
