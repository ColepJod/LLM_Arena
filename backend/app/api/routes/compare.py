"""Comparison API routes."""

import json
import logging
from collections.abc import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.core.rate_limit import enforce_compare_rate_limit
from app.schemas.common import (
    ModelInfo,
    ModelsResponse,
    Provider,
    ProviderInfo,
    ProvidersResponse,
)
from app.schemas.compare import CompareRequest
from app.services.catalog import MODEL_CATALOG, PROVIDER_NAMES
from app.services.compare import run_comparison

router = APIRouter(tags=["arena"])
logger = logging.getLogger(__name__)


@router.get("/providers", response_model=ProvidersResponse)
async def list_providers() -> ProvidersResponse:
    """Return each provider and whether its API key is configured."""
    settings = get_settings()
    return ProvidersResponse(
        providers=[
            ProviderInfo(
                id=provider,
                name=PROVIDER_NAMES[provider],
                available=settings.provider_available(provider),
            )
            for provider in ("groq", "openrouter", "gemini")
        ]
    )


@router.get("/models", response_model=ModelsResponse)
async def list_models(provider: Provider) -> ModelsResponse:
    """Return the curated free-model catalog for one provider."""
    return ModelsResponse(
        provider=provider,
        models=[
            ModelInfo(id=entry.id, name=entry.name) for entry in MODEL_CATALOG[provider]
        ],
    )


@router.post(
    "/compare",
    dependencies=[Depends(enforce_compare_rate_limit)],
    response_class=StreamingResponse,
)
async def compare(payload: CompareRequest, request: Request) -> StreamingResponse:
    """Stream two model responses as one interleaved NDJSON response."""
    request_id = uuid4().hex[:12]
    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "compare.request.started",
        extra={
            "event": "compare.request.started",
            "request_id": request_id,
            "provider": payload.a.provider,
            "model": payload.a.model,
            "side": "a",
            "client_ip": client_ip,
        },
    )
    logger.info(
        "compare.request.started",
        extra={
            "event": "compare.request.started",
            "request_id": request_id,
            "provider": payload.b.provider,
            "model": payload.b.model,
            "side": "b",
            "client_ip": client_ip,
        },
    )

    async def event_stream() -> AsyncIterator[str]:
        async for event in run_comparison(
            payload.prompt,
            payload.a,
            payload.b,
            request_id=request_id,
        ):
            yield (
                json.dumps(
                    event.model_dump(),
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
