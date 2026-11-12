"""
CINEVERSE Backend Configuration

Reads environment variables and validates settings at startup using pydantic-settings.
Watchmode, MovieLens, LLM, and database settings are kept strictly server-side.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Application settings loaded from backend/.env and environment variables."""

    # Application metadata
    app_name: str = "CINEVERSE API"
    app_version: str = "0.2.0"
    debug: bool = False

    # CORS — the Next.js dev server address
    frontend_origin: str = "http://localhost:3000"

    # Watchmode API credentials & defaults
    watchmode_api_key: str = ""
    watchmode_base_url: str = "https://api.watchmode.com/v1"
    watchmode_region: str = "IN"
    watchmode_timeout_seconds: float = 12.0
    watchmode_max_retries: int = 2
    watchmode_cache_ttl_seconds: int = 86400  # 24h (strictly within Watchmode 30-day rule)
    cineverse_cache_enabled: bool = True

    # MovieLens & Local SQLite storage
    movielens_data_dir: str = "./ml/data/raw"
    database_url: str = "sqlite:///./data/cineverse.db"

    # Optional external integrations
    llm_api_key: str = ""
    supabase_url: str = ""
    supabase_key: str = ""

    # Admin Analytics & Security
    admin_api_key: str = ""
    rate_limit_per_minute: int = 180

    # Legacy TMDB credential kept optional only for migration compatibility (never called)
    tmdb_access_token: str = ""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def has_watchmode_key(self) -> bool:
        """Return True when a non-placeholder Watchmode API key is configured."""
        key = (self.watchmode_api_key or "").strip()
        return bool(key and key != "your_watchmode_api_key")

    @property
    def has_admin_key(self) -> bool:
        """Return True when a non-placeholder Admin API key is configured."""
        key = (self.admin_api_key or "").strip()
        return bool(key and key != "your_admin_api_key_here")

    @property
    def sqlite_db_path(self) -> Path:
        """Resolve local SQLite file path from database_url."""
        raw = (self.database_url or "").strip()
        if raw.startswith("sqlite:///"):
            rel = raw.removeprefix("sqlite:///")
            candidate = Path(rel)
            return candidate if candidate.is_absolute() else (BACKEND_DIR / candidate).resolve()
        return (BACKEND_DIR / "data" / "cineverse.db").resolve()

    @property
    def resolved_movielens_dir(self) -> Path:
        """Resolve MovieLens dataset directory path."""
        candidate = Path(self.movielens_data_dir)
        return candidate if candidate.is_absolute() else (BACKEND_DIR / candidate).resolve()

    @property
    def allowed_origins(self) -> list[str]:
        """Return deduplicated CORS allowed origins."""
        origins = [self.frontend_origin]
        if self.debug:
            for local_origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
                if local_origin not in origins:
                    origins.append(local_origin)
        return origins


# Single shared settings instance
settings = Settings()
