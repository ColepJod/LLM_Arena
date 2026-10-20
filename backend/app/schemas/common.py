"""Shared request and response types."""

from typing import Literal

from pydantic import BaseModel, Field

Provider = Literal["groq", "openrouter", "gemini"]
Side = Literal["a", "b"]

MAX_PROMPT_CHARS = 4_000


class ModelSelection(BaseModel):
    """A provider/model pair selected for one pane."""

    provider: Provider = Field(description="Provider id.")
    model: str = Field(min_length=1, max_length=200, description="Provider model id.")


class ProviderInfo(BaseModel):
    """Availability information for one provider."""

    id: Provider
    name: str
    available: bool


class ProvidersResponse(BaseModel):
    """Response body for ``GET /providers``."""

    providers: list[ProviderInfo]


class ModelInfo(BaseModel):
    """One model in a provider's curated catalog."""

    id: str
    name: str


class ModelsResponse(BaseModel):
    """Response body for ``GET /models``."""

    provider: Provider
    models: list[ModelInfo]
