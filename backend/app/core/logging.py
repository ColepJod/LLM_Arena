"""Small structured JSON logging setup.

Only safe metadata is emitted. Prompts, response text, API keys, and raw
provider exception messages are never logged.
"""

import json
import logging
from typing import Any

_EXTRA_FIELDS = (
    "event",
    "request_id",
    "side",
    "provider",
    "model",
    "ttft_ms",
    "total_ms",
    "output_chars",
    "outcome",
    "error_type",
    "status_code",
    "client_ip",
)

_STANDARD_FIELDS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {
    "message",
    "asctime",
}


class JsonFormatter(logging.Formatter):
    """Render each log record as one JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in _EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        for key, value in record.__dict__.items():
            if (
                key not in _STANDARD_FIELDS
                and key not in payload
                and not key.startswith("_")
                and (isinstance(value, (str, int, float, bool)) or value is None)
            ):
                payload[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Configure the root logger once with the JSON formatter."""
    root = logging.getLogger()
    if any(getattr(handler, "_model_arena", False) for handler in root.handlers):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler._model_arena = True  # type: ignore[attr-defined]
    root.addHandler(handler)
    root.setLevel(level)
