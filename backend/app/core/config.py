"""Application settings loaded from environment variables via Pydantic Settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.schemas.common import Provider


class Settings(BaseSettings):
    """Runtime configuration for the application.

    Every value is read from an environment variable or the backend ``.env``
    file. Credentials are never hardcoded.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    groq_api_key: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""

    groq_base_url: str = "https://api.groq.com/openai/v1"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_site_url: str = ""
    openrouter_app_name: str = "Model Arena"

    allowed_origins: str = "http://localhost:3000"
    llm_timeout_seconds: float = 60.0
    rate_limit_requests: int = 10
    rate_limit_window_seconds: int = 60

    @property
    def cors_origins(self) -> list[str]:
        """Parse the comma-separated CORS origin list."""
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]

    def provider_available(self, provider: Provider) -> bool:
        """Return whether the provider's API key is configured."""
        match provider:
            case "groq":
                return bool(self.groq_api_key)
            case "openrouter":
                return bool(self.openrouter_api_key)
            case "gemini":
                return bool(self.gemini_api_key)
        return False


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()
