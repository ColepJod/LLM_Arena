"""Curated catalog of free-tier models.

Free model ids change frequently. Update this file when a provider retires a
model or launches a new one. To add a model, append a ``CatalogModel`` to the
matching provider tuple below; the UI and request validation pick it up
automatically. The provider's API key still controls whether the provider is
enabled in the UI.

Last verified: 2026-10-20 against the official Groq model list, the live
OpenRouter ``/api/v1/models`` response filtered to ``:free`` ids, and Google's
Gemini models and free-tier pricing pages.
"""

from dataclasses import dataclass

from app.schemas.common import Provider

PROVIDER_NAMES: dict[Provider, str] = {
    "groq": "Groq",
    "openrouter": "OpenRouter",
    "gemini": "Gemini",
}


@dataclass(frozen=True, slots=True)
class CatalogModel:
    """A single curated model."""

    id: str
    name: str


MODEL_CATALOG: dict[Provider, tuple[CatalogModel, ...]] = {
    "groq": (
        CatalogModel("openai/gpt-oss-120b", "GPT-OSS 120B"),
        CatalogModel("openai/gpt-oss-20b", "GPT-OSS 20B"),
        CatalogModel("qwen/qwen3.8-27b", "Qwen 3.8 27B"),
        CatalogModel("llama-3.3-70b-versatile", "Llama 3.3 70B"),
        CatalogModel("llama-3.1-8b-instant", "Llama 3.1 8B"),
    ),
    "openrouter": (
        CatalogModel("minimax/minimax-m3.1-flash:free", "MiniMax M3.1 Flash"),
        CatalogModel("google/gemma-4-31b-it:free", "Gemma 4 31B"),
        CatalogModel("google/gemma-4-26b-a4b-it:free", "Gemma 4 26B A4B"),
        CatalogModel("nvidia/nemotron-3-ultra-550b-a55b:free", "Nemotron 3 Ultra"),
        CatalogModel("nvidia/nemotron-3-super-120b-a12b:free", "Nemotron 3 Super"),
        CatalogModel("thinkingmachines/inkling:free", "Inkling"),
        CatalogModel("poolside/laguna-s-2.1:free", "Laguna S 2.1"),
    ),
    "gemini": (
        CatalogModel("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite"),
        CatalogModel("gemini-2.5-flash", "Gemini 2.5 Flash"),
        CatalogModel("gemini-3.8-flash", "Gemini 3.8 Flash"),
        CatalogModel("gemini-3.6-flash", "Gemini 3.6 Flash"),
        CatalogModel("gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite"),
    ),
}


def get_models(provider: Provider) -> tuple[CatalogModel, ...]:
    """Return the curated models for ``provider``."""
    return MODEL_CATALOG[provider]


def is_valid_model(provider: Provider, model: str) -> bool:
    """Return whether ``model`` is in ``provider``'s curated catalog."""
    return any(entry.id == model for entry in get_models(provider))


def get_model_name(provider: Provider, model: str) -> str:
    """Return the display name for a catalog model, or the id as a fallback."""
    for entry in get_models(provider):
        if entry.id == model:
            return entry.name
    return model
