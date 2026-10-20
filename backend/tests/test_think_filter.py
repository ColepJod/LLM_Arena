import pytest

from app.services.stream import ThinkingFilter, content_as_text


def collect(chunks: list[str]) -> str:
    filter_ = ThinkingFilter()
    output = "".join(filter_.push(chunk) for chunk in chunks)
    return output + filter_.flush()


@pytest.mark.parametrize(
    ("chunks", "expected"),
    [
        (["Hello", " world"], "Hello world"),
        (["<think>secret</think>Answer"], "Answer"),
        (["  <think>secret</think>  Answer"], "Answer"),
        (["Hello <thi", "nk>secret</thi", "nk> world"], "Hello  world"),
        (["A<think>one</think>B<think>two</think>C"], "ABC"),
        (["<think>unfinished"], ""),
        (["Hello <thi"], "Hello <thi"),
        (["<think></think>"], ""),
        (["\n\n  <think>x</think>\n\nHello"], "Hello"),
        (["<think>a</think><think>b</think>Visible"], "Visible"),
    ],
)
def test_thinking_filter(chunks: list[str], expected: str) -> None:
    assert collect(chunks) == expected


def test_thinking_filter_handles_single_characters() -> None:
    text = "Before <think>hidden</think> after"
    assert collect(list(text)) == "Before  after"


def test_content_as_text_normalizes_blocks() -> None:
    assert content_as_text("hello") == "hello"
    assert (
        content_as_text(
            [
                {"type": "text", "text": "Hello "},
                {"type": "reasoning", "text": "ignore"},
                "world",
            ]
        )
        == "Hello world"
    )
    assert content_as_text(42) == ""
