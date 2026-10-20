import json

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.schemas.common import ModelSelection
from app.services.llm import (
    MissingAPIKeyError,
    UpstreamError,
    translate_upstream_error,
)

client = TestClient(app)

VALID_PAYLOAD = {
    "prompt": "Explain recursion simply",
    "a": {"provider": "groq", "model": "openai/gpt-oss-120b"},
    "b": {"provider": "gemini", "model": "gemini-3.8-flash"},
}


def test_providers_endpoint_shape() -> None:
    response = client.get("/providers")
    assert response.status_code == 200
    providers = response.json()["providers"]
    assert [provider["id"] for provider in providers] == [
        "groq",
        "openrouter",
        "gemini",
    ]
    assert all(isinstance(provider["available"], bool) for provider in providers)


def test_models_endpoint() -> None:
    response = client.get("/models", params={"provider": "groq"})
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "groq"
    assert body["models"]
    assert all({"id", "name"} <= model.keys() for model in body["models"])


def test_invalid_provider_is_422() -> None:
    response = client.get("/models", params={"provider": "unknown"})
    assert response.status_code == 422


def test_blank_prompt_is_422() -> None:
    payload = {**VALID_PAYLOAD, "prompt": "   "}
    response = client.post("/compare", json=payload)
    assert response.status_code == 422


def test_oversized_prompt_is_422() -> None:
    payload = {**VALID_PAYLOAD, "prompt": "x" * 4_001}
    response = client.post("/compare", json=payload)
    assert response.status_code == 422


def test_model_outside_catalog_is_422() -> None:
    payload = {
        **VALID_PAYLOAD,
        "a": {"provider": "groq", "model": "not-a-real-model"},
    }
    response = client.post("/compare", json=payload)
    assert response.status_code == 422
    assert "free-model catalog" in json.dumps(response.json())


def test_same_model_on_both_sides_is_allowed(monkeypatch) -> None:
    import app.api.routes.compare as compare_route
    from app.schemas.compare import DeltaEvent, DoneEvent, StartEvent

    async def fake_run_comparison(
        prompt, a, b, *, request_id="", research_enabled=False
    ):
        yield StartEvent(side="a")
        yield StartEvent(side="b")
        yield DeltaEvent(side="a", text="same")
        yield DeltaEvent(side="b", text="model")
        yield DoneEvent(side="a", ttft_ms=1, total_ms=2, output_chars=4)
        yield DoneEvent(side="b", ttft_ms=1, total_ms=3, output_chars=5)

    monkeypatch.setattr(compare_route, "run_comparison", fake_run_comparison)
    same = {"provider": "groq", "model": "openai/gpt-oss-120b"}
    response = client.post(
        "/compare",
        json={"prompt": "test", "a": same, "b": same},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    lines = [line for line in response.text.splitlines() if line]
    events = [json.loads(line) for line in lines]
    assert events[0] == {"side": "a", "type": "start"}
    assert any(event["type"] == "done" for event in events)


def test_settings_provider_availability() -> None:
    settings = Settings(
        _env_file=None,
        groq_api_key="gsk-test",
        openrouter_api_key="",
        gemini_api_key="",
    )
    assert settings.provider_available("groq") is True
    assert settings.provider_available("openrouter") is False
    assert settings.provider_available("gemini") is False


def test_missing_key_and_upstream_errors_have_safe_messages() -> None:
    assert "not configured" in MissingAPIKeyError("gemini").user_message
    assert (
        "Rate limit"
        in UpstreamError("Rate limit reached.", status_code=429).user_message
    )
    assert ModelSelection(provider="groq", model="openai/gpt-oss-120b")


def test_status_codes_embedded_in_provider_errors_are_translated() -> None:
    overloaded = translate_upstream_error(
        RuntimeError("503 UNAVAILABLE. This model is in high demand.")
    )
    assert "temporarily unavailable" in overloaded.user_message

    rate_limited = translate_upstream_error(RuntimeError("429 Too Many Requests"))
    assert "Rate limit" in rate_limited.user_message
