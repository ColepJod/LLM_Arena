"""Provider factory and safe upstream error translation."""

import asyncio

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)

from app.core.config import get_settings
from app.schemas.common import ModelSelection, Provider
from app.services.catalog import PROVIDER_NAMES


class LLMError(Exception):
    """Base class for user-safe LLM errors."""

    user_message = "The model failed to generate a response."


class MissingAPIKeyError(LLMError):
    """Raised when the selected provider has no configured API key."""

    def __init__(self, provider: Provider) -> None:
        name = PROVIDER_NAMES[provider]
        super().__init__(f"{name} API key is not configured on the server.")
        self.user_message = f"{name} API key is not configured on the server."


class UpstreamError(LLMError):
    """Raised when a provider request fails."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.user_message = message
        self.status_code = status_code


def _require_key(value: str, provider: Provider) -> str:
    if not value:
        raise MissingAPIKeyError(provider)
    return value


def get_llm(selection: ModelSelection) -> BaseChatModel:
    """Build the LangChain chat model for a provider/model pair."""
    settings = get_settings()

    match selection.provider:
        case "groq":
            return ChatOpenAI(
                model=selection.model,
                base_url=settings.groq_base_url,
                api_key=_require_key(settings.groq_api_key, "groq"),
                temperature=0.7,
                max_retries=0,
                timeout=settings.llm_timeout_seconds,
                streaming=True,
            )
        case "openrouter":
            headers: dict[str, str] = {}
            if settings.openrouter_site_url:
                headers["HTTP-Referer"] = settings.openrouter_site_url
            if settings.openrouter_app_name:
                headers["X-Title"] = settings.openrouter_app_name
            return ChatOpenAI(
                model=selection.model,
                base_url=settings.openrouter_base_url,
                api_key=_require_key(settings.openrouter_api_key, "openrouter"),
                temperature=0.7,
                max_retries=0,
                timeout=settings.llm_timeout_seconds,
                streaming=True,
                default_headers=headers or None,
            )
        case "gemini":
            return ChatGoogleGenerativeAI(
                model=selection.model,
                api_key=_require_key(settings.gemini_api_key, "gemini"),
                temperature=0.7,
                retries=1,
                request_timeout=settings.llm_timeout_seconds,
                streaming=True,
            )


def _exception_status_code(exc: Exception) -> int | None:
    """Extract an HTTP-like status code from common provider exceptions."""
    for attribute in ("status_code", "http_status", "code"):
        value = getattr(exc, attribute, None)
        if isinstance(value, int):
            return value
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    if isinstance(status, int):
        return status
    return None


def translate_upstream_error(exc: Exception) -> UpstreamError:
    """Map provider failures onto short, user-safe messages."""
    if isinstance(exc, (APITimeoutError, TimeoutError, asyncio.TimeoutError)):
        return UpstreamError("The model took too long to respond. Try again.")
    if isinstance(exc, (AuthenticationError, PermissionDeniedError)):
        return UpstreamError(
            "The provider rejected its API key. Check the backend .env file.",
            status_code=401,
        )

    status = _exception_status_code(exc)
    if status in (401, 403):
        return UpstreamError(
            "The provider rejected its API key. Check the backend .env file.",
            status_code=status,
        )
    if status == 404:
        return UpstreamError(
            "This model is no longer available. Choose another model.",
            status_code=404,
        )
    if status == 429:
        return UpstreamError(
            "Rate limit reached for this model. Try again shortly or choose "
            "another model.",
            status_code=429,
        )
    if status in (408, 504):
        return UpstreamError("The model took too long to respond. Try again.")
    if isinstance(exc, BadRequestError) or status == 400:
        return UpstreamError(
            "The provider rejected this request. Try a different model or prompt.",
            status_code=400,
        )
    if isinstance(exc, NotFoundError):
        return UpstreamError(
            "This model is no longer available. Choose another model.",
            status_code=404,
        )
    if isinstance(exc, RateLimitError):
        return UpstreamError(
            "Rate limit reached for this model. Try again shortly or choose "
            "another model.",
            status_code=429,
        )
    if isinstance(exc, (APIConnectionError, APIError)) or (
        status is not None and status >= 500
    ):
        return UpstreamError(
            "The provider is temporarily unavailable. Try again.",
            status_code=status or 502,
        )
    return UpstreamError("Something went wrong while generating a response.")
