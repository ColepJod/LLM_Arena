"""Schemas for comparison requests and NDJSON events."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import MAX_PROMPT_CHARS, ModelSelection, Side


class CompareRequest(BaseModel):
    """Body of a ``POST /compare`` request.

    Both panes may use the same provider/model; duplicate selections are
    intentionally allowed.
    """

    prompt: str = Field(
        min_length=1,
        max_length=MAX_PROMPT_CHARS,
        description="The single prompt sent to both models.",
    )
    a: ModelSelection
    b: ModelSelection

    @field_validator("prompt")
    @classmethod
    def prompt_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Prompt must not be blank.")
        return stripped

    @model_validator(mode="after")
    def models_must_be_in_catalog(self) -> "CompareRequest":
        # Imported lazily to keep the request schema independent at import time.
        from app.services.catalog import is_valid_model

        for side, selection in (("a", self.a), ("b", self.b)):
            if not is_valid_model(selection.provider, selection.model):
                raise ValueError(
                    f"Model '{selection.model}' is not in the {selection.provider} "
                    f"free-model catalog (side {side})."
                )
        return self


class StartEvent(BaseModel):
    side: Side
    type: Literal["start"] = "start"


class DeltaEvent(BaseModel):
    side: Side
    type: Literal["delta"] = "delta"
    text: str


class DoneEvent(BaseModel):
    side: Side
    type: Literal["done"] = "done"
    ttft_ms: int
    total_ms: int
    output_chars: int


class ErrorEvent(BaseModel):
    side: Side
    type: Literal["error"] = "error"
    message: str
