"""
CINEVERSE Backend Configuration

This module reads environment variables and makes them available
throughout the application via a single Settings object.
Using pydantic-settings means environment variables are type-checked
and validated on startup — a production best practice.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application metadata
    app_name: str = "CINEVERSE API"
    app_version: str = "0.1.0"
    debug: bool = False

    # CORS — the Next.js dev server address
    frontend_origin: str = "http://localhost:3000"

    # External API credentials (populated from .env file)
    tmdb_access_token: str = ""
    llm_api_key: str = ""

    # Supabase credentials
    supabase_url: str = ""
    supabase_key: str = ""

    model_config = SettingsConfigDict(
        # Look for a .env file in the backend directory
        env_file=".env",
        env_file_encoding="utf-8",
        # Allow extra fields to prevent errors if .env has additional vars
        extra="ignore",
    )


# A single shared instance used throughout the app
settings = Settings()
