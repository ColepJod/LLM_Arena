"""Single-model streaming, reasoning-block filtering, and metrics."""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import HumanMessage

from app.schemas.common import ModelSelection
from app.services.llm import LLMError, get_llm, translate_upstream_error


class ThinkingFilter:
    """Drop ``<think>...</think>`` blocks from a token stream.

    Tags can be split across chunks, so a small trailing buffer is retained
    until the filter can tell whether a partial tag is about to complete.
    Leading whitespace after the reasoning block is trimmed.
    """

    _OPEN = "<think>"
    _CLOSE = "</think>"

    def __init__(self) -> None:
        self._buffer = ""
        self._thinking = False
        self._leading = True

    @staticmethod
    def _trailing_prefix_len(text: str, target: str) -> int:
        """Return the longest suffix of ``text`` matching a prefix of ``target``."""
        for size in range(min(len(text), len(target)), 0, -1):
            if text.endswith(target[:size]):
                return size
        return 0

    def _strip_leading(self, text: str) -> str:
        if not self._leading:
            return text
        stripped = text.lstrip()
        if stripped:
            self._leading = False
        return stripped

    def push(self, chunk: str) -> str:
        """Feed ``chunk`` and return text that is safe to emit."""
        self._buffer += chunk
        emitted: list[str] = []

        while True:
            if self._thinking:
                close = self._buffer.find(self._CLOSE)
                if close == -1:
                    keep = self._trailing_prefix_len(self._buffer, self._CLOSE)
                    self._buffer = self._buffer[-keep:] if keep else ""
                    break
                self._buffer = self._buffer[close + len(self._CLOSE) :]
                self._thinking = False
                continue

            open_tag = self._buffer.find(self._OPEN)
            if open_tag == -1:
                keep = self._trailing_prefix_len(self._buffer, self._OPEN)
                emit_len = len(self._buffer) - keep
                if emit_len > 0:
                    emitted.append(self._strip_leading(self._buffer[:emit_len]))
                    self._buffer = self._buffer[emit_len:]
                break

            if open_tag > 0:
                emitted.append(self._strip_leading(self._buffer[:open_tag]))
            self._buffer = self._buffer[open_tag + len(self._OPEN) :]
            self._thinking = True

        return "".join(emitted)

    def flush(self) -> str:
        """Emit buffered visible text after the stream ends."""
        if self._thinking:
            self._buffer = ""
            return ""
        remaining = self._strip_leading(self._buffer)
        self._buffer = ""
        return remaining


def content_as_text(content: Any) -> str:
    """Normalize a LangChain message content payload into plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


async def model_text_stream(
    selection: ModelSelection,
    prompt: str,
) -> AsyncIterator[str]:
    """Stream visible text from a single LangChain model."""
    llm = get_llm(selection)
    thinking_filter = ThinkingFilter()

    try:
        async for chunk in llm.astream([HumanMessage(content=prompt)]):
            text = content_as_text(chunk.content)
            if not text:
                continue
            emitted = thinking_filter.push(text)
            if emitted:
                yield emitted
    except (asyncio.CancelledError, GeneratorExit):
        raise
    except LLMError:
        raise
    except Exception as exc:
        raise translate_upstream_error(exc) from exc

    tail = thinking_filter.flush()
    if tail:
        yield tail
