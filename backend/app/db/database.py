"""
CINEVERSE Local Persistence & Canonical Content Store (SQLite)

Provides:
- Canonical internal content IDs (`content_items.id`) decoupled from Watchmode/TMDB IDs.
- External ID cross-reference (`watchmode_id`, `imdb_id`, `legacy_tmdb_id`).
- 24-hour TTL cache metadata respecting Watchmode free Developer plan data-retention rules.
- MovieLens -> IMDb -> Watchmode ID mapping provenance (`id_mappings`).
- User watchlist, ratings, collections, and API credit usage tracking.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from app.core.config import settings


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _utc_future_iso(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def _is_not_expired(expires_iso: str | None) -> bool:
    if not expires_iso:
        return False
    try:
        dt = datetime.fromisoformat(expires_iso)
        return dt > datetime.now(timezone.utc)
    except ValueError:
        return False


class DatabaseManager:
    """Thread-safe lightweight SQLite manager using parameterized queries."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or settings.sqlite_db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self.connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS content_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    watchmode_id INTEGER UNIQUE,
                    imdb_id TEXT,
                    legacy_tmdb_id INTEGER,
                    title TEXT NOT NULL,
                    original_title TEXT,
                    content_type TEXT NOT NULL DEFAULT 'MOVIE',
                    watchmode_type TEXT,
                    is_documentary INTEGER NOT NULL DEFAULT 0,
                    release_year INTEGER,
                    release_date TEXT,
                    description TEXT,
                    poster_url TEXT,
                    backdrop_url TEXT,
                    genres_json TEXT NOT NULL DEFAULT '[]',
                    genre_ids_json TEXT NOT NULL DEFAULT '[]',
                    runtime INTEGER,
                    rating REAL,
                    rating_source TEXT,
                    popularity REAL,
                    language TEXT,
                    country TEXT,
                    cast_json TEXT NOT NULL DEFAULT '[]',
                    directors_json TEXT NOT NULL DEFAULT '[]',
                    streaming_sources_json TEXT NOT NULL DEFAULT '[]',
                    seasons_json TEXT NOT NULL DEFAULT '[]',
                    episodes_json TEXT NOT NULL DEFAULT '[]',
                    similar_ids_json TEXT NOT NULL DEFAULT '[]',
                    trailer_url TEXT,
                    has_full_details INTEGER NOT NULL DEFAULT 0,
                    last_synced_at TEXT,
                    cache_expires_at TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_content_type ON content_items(content_type);
                CREATE INDEX IF NOT EXISTS idx_content_watchmode_id ON content_items(watchmode_id);
                CREATE INDEX IF NOT EXISTS idx_content_imdb_id ON content_items(imdb_id);
                CREATE INDEX IF NOT EXISTS idx_content_legacy_tmdb_id ON content_items(legacy_tmdb_id);
                CREATE INDEX IF NOT EXISTS idx_content_title ON content_items(title);
                CREATE INDEX IF NOT EXISTS idx_content_release_year ON content_items(release_year);

                CREATE TABLE IF NOT EXISTS id_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    movielens_movie_id INTEGER UNIQUE,
                    imdb_id TEXT,
                    legacy_tmdb_id INTEGER,
                    watchmode_id INTEGER,
                    canonical_content_id INTEGER,
                    title TEXT,
                    release_year INTEGER,
                    match_method TEXT NOT NULL,
                    match_status TEXT NOT NULL,
                    source_provenance TEXT NOT NULL,
                    mapped_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_id_map_imdb ON id_mappings(imdb_id);
                CREATE INDEX IF NOT EXISTS idx_id_map_watchmode ON id_mappings(watchmode_id);
                CREATE INDEX IF NOT EXISTS idx_id_map_tmdb ON id_mappings(legacy_tmdb_id);

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    preferred_genres_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS watchlist_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL DEFAULT 'local-default',
                    content_id INTEGER NOT NULL,
                    legacy_tmdb_id INTEGER,
                    title TEXT NOT NULL,
                    content_type TEXT NOT NULL DEFAULT 'MOVIE',
                    poster_url TEXT,
                    release_year INTEGER,
                    rating REAL,
                    reconciliation_status TEXT NOT NULL DEFAULT 'resolved',
                    added_at TEXT NOT NULL,
                    UNIQUE(user_id, content_id)
                );

                CREATE TABLE IF NOT EXISTS user_ratings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL DEFAULT 'local-default',
                    content_id INTEGER NOT NULL,
                    rating REAL NOT NULL,
                    rated_at TEXT NOT NULL,
                    UNIQUE(user_id, content_id)
                );

                CREATE TABLE IF NOT EXISTS collections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL DEFAULT 'local-default',
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS collection_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                    content_id INTEGER NOT NULL,
                    added_at TEXT NOT NULL,
                    UNIQUE(collection_id, content_id)
                );

                CREATE TABLE IF NOT EXISTS api_credit_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    endpoint TEXT NOT NULL,
                    credits_spent INTEGER NOT NULL DEFAULT 1,
                    recorded_at TEXT NOT NULL
                );
                """
            )

    def record_credit_usage(self, endpoint: str, credits: int = 1) -> None:
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO api_credit_usage (endpoint, credits_spent, recorded_at) VALUES (?, ?, ?)",
                (endpoint, credits, _utc_now_iso()),
            )

    def get_total_recorded_credits(self) -> int:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(credits_spent), 0) AS total FROM api_credit_usage"
            ).fetchone()
            return int(row["total"]) if row else 0

    def upsert_content_item(
        self,
        item: dict[str, Any],
        *,
        full_details: bool = False,
        ttl_seconds: int | None = None,
    ) -> int:
        """Insert or update a normalized content record and return its canonical internal ID."""
        ttl = ttl_seconds if ttl_seconds is not None else settings.watchmode_cache_ttl_seconds
        now_iso = _utc_now_iso()
        expires_iso = _utc_future_iso(ttl)
        watchmode_id = item.get("watchmode_id")

        with self.connection() as conn:
            existing = None
            if watchmode_id is not None:
                existing = conn.execute(
                    "SELECT id, has_full_details FROM content_items WHERE watchmode_id = ?",
                    (watchmode_id,),
                ).fetchone()

            if existing is None and item.get("imdb_id"):
                existing = conn.execute(
                    "SELECT id, has_full_details FROM content_items WHERE imdb_id = ?",
                    (item["imdb_id"],),
                ).fetchone()

            if existing is None:
                cur = conn.execute(
                    """
                    INSERT INTO content_items (
                        watchmode_id, imdb_id, legacy_tmdb_id, title, original_title,
                        content_type, watchmode_type, is_documentary, release_year, release_date,
                        description, poster_url, backdrop_url, genres_json, genre_ids_json,
                        runtime, rating, rating_source, popularity, language, country,
                        cast_json, directors_json, streaming_sources_json, seasons_json,
                        episodes_json, similar_ids_json, trailer_url, has_full_details,
                        last_synced_at, cache_expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        watchmode_id,
                        item.get("imdb_id"),
                        item.get("legacy_tmdb_id"),
                        item["title"],
                        item.get("original_title"),
                        item.get("content_type", "MOVIE"),
                        item.get("watchmode_type"),
                        1 if item.get("is_documentary") else 0,
                        item.get("release_year"),
                        item.get("release_date"),
                        item.get("description"),
                        item.get("poster_url"),
                        item.get("backdrop_url"),
                        json.dumps(item.get("genres") or []),
                        json.dumps(item.get("genre_ids") or []),
                        item.get("runtime"),
                        item.get("rating"),
                        item.get("rating_source"),
                        item.get("popularity"),
                        item.get("language"),
                        item.get("country"),
                        json.dumps(item.get("cast") or []),
                        json.dumps(item.get("directors") or []),
                        json.dumps(item.get("streaming_sources") or []),
                        json.dumps(item.get("seasons") or []),
                        json.dumps(item.get("episodes") or []),
                        json.dumps(item.get("similar_title_ids") or []),
                        item.get("trailer_url"),
                        1 if full_details else 0,
                        now_iso,
                        expires_iso,
                    ),
                )
                return int(cur.lastrowid)

            canonical_id = int(existing["id"])
            if full_details:
                conn.execute(
                    """
                    UPDATE content_items SET
                        watchmode_id = COALESCE(?, watchmode_id),
                        imdb_id = COALESCE(?, imdb_id),
                        legacy_tmdb_id = COALESCE(?, legacy_tmdb_id),
                        title = ?,
                        original_title = COALESCE(?, original_title),
                        content_type = ?,
                        watchmode_type = COALESCE(?, watchmode_type),
                        is_documentary = ?,
                        release_year = COALESCE(?, release_year),
                        release_date = COALESCE(?, release_date),
                        description = COALESCE(?, description),
                        poster_url = COALESCE(?, poster_url),
                        backdrop_url = COALESCE(?, backdrop_url),
                        genres_json = ?,
                        genre_ids_json = ?,
                        runtime = COALESCE(?, runtime),
                        rating = COALESCE(?, rating),
                        rating_source = COALESCE(?, rating_source),
                        popularity = COALESCE(?, popularity),
                        language = COALESCE(?, language),
                        country = COALESCE(?, country),
                        cast_json = ?,
                        directors_json = ?,
                        streaming_sources_json = ?,
                        seasons_json = ?,
                        episodes_json = ?,
                        similar_ids_json = ?,
                        trailer_url = COALESCE(?, trailer_url),
                        has_full_details = 1,
                        last_synced_at = ?,
                        cache_expires_at = ?
                    WHERE id = ?
                    """,
                    (
                        watchmode_id,
                        item.get("imdb_id"),
                        item.get("legacy_tmdb_id"),
                        item["title"],
                        item.get("original_title"),
                        item.get("content_type", "MOVIE"),
                        item.get("watchmode_type"),
                        1 if item.get("is_documentary") else 0,
                        item.get("release_year"),
                        item.get("release_date"),
                        item.get("description"),
                        item.get("poster_url"),
                        item.get("backdrop_url"),
                        json.dumps(item.get("genres") or []),
                        json.dumps(item.get("genre_ids") or []),
                        item.get("runtime"),
                        item.get("rating"),
                        item.get("rating_source"),
                        item.get("popularity"),
                        item.get("language"),
                        item.get("country"),
                        json.dumps(item.get("cast") or []),
                        json.dumps(item.get("directors") or []),
                        json.dumps(item.get("streaming_sources") or []),
                        json.dumps(item.get("seasons") or []),
                        json.dumps(item.get("episodes") or []),
                        json.dumps(item.get("similar_title_ids") or []),
                        item.get("trailer_url"),
                        now_iso,
                        expires_iso,
                        canonical_id,
                    ),
                )
            else:
                genres_json = json.dumps(item["genres"]) if item.get("genres") else None
                genre_ids_json = json.dumps(item["genre_ids"]) if item.get("genre_ids") else None
                conn.execute(
                    """
                    UPDATE content_items SET
                        imdb_id = COALESCE(?, imdb_id),
                        legacy_tmdb_id = COALESCE(?, legacy_tmdb_id),
                        title = ?,
                        original_title = COALESCE(?, original_title),
                        content_type = CASE
                            WHEN has_full_details = 1 THEN content_type
                            ELSE ?
                        END,
                        watchmode_type = COALESCE(?, watchmode_type),
                        is_documentary = CASE
                            WHEN has_full_details = 1 THEN is_documentary
                            ELSE MAX(is_documentary, ?)
                        END,
                        release_year = COALESCE(?, release_year),
                        release_date = COALESCE(?, release_date),
                        description = COALESCE(?, description),
                        poster_url = COALESCE(?, poster_url),
                        backdrop_url = COALESCE(?, backdrop_url),
                        genres_json = COALESCE(?, genres_json),
                        genre_ids_json = COALESCE(?, genre_ids_json),
                        runtime = COALESCE(?, runtime),
                        rating = COALESCE(?, rating),
                        rating_source = COALESCE(?, rating_source),
                        popularity = COALESCE(?, popularity),
                        language = COALESCE(?, language),
                        similar_ids_json = COALESCE(?, similar_ids_json),
                        last_synced_at = ?
                    WHERE id = ?
                    """,
                    (
                        item.get("imdb_id"),
                        item.get("legacy_tmdb_id"),
                        item["title"],
                        item.get("original_title"),
                        item.get("content_type", "MOVIE"),
                        item.get("watchmode_type"),
                        1 if item.get("is_documentary") else 0,
                        item.get("release_year"),
                        item.get("release_date"),
                        item.get("description"),
                        item.get("poster_url"),
                        item.get("backdrop_url"),
                        genres_json,
                        genre_ids_json,
                        item.get("runtime"),
                        item.get("rating"),
                        item.get("rating_source"),
                        item.get("popularity"),
                        item.get("language"),
                        json.dumps(item["similar_title_ids"]) if item.get("similar_title_ids") else None,
                        now_iso,
                        canonical_id,
                    ),
                )
            return canonical_id

    def get_content_by_any_id(self, identifier: int) -> dict[str, Any] | None:
        """Look up cached content by canonical ID first, then Watchmode ID."""
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM content_items WHERE id = ?",
                (identifier,),
            ).fetchone()
            if row is None:
                row = conn.execute(
                    "SELECT * FROM content_items WHERE watchmode_id = ?",
                    (identifier,),
                ).fetchone()
            if row is None:
                return None
            return self._row_to_content_dict(row)

    def get_fresh_full_detail_by_watchmode_id(self, watchmode_id: int) -> dict[str, Any] | None:
        """Return cached full details only if unexpired (respecting 30-day Watchmode limit)."""
        if not settings.cineverse_cache_enabled:
            return None
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM content_items WHERE watchmode_id = ? AND has_full_details = 1",
                (watchmode_id,),
            ).fetchone()
            if row is None or not _is_not_expired(row["cache_expires_at"]):
                return None
            return self._row_to_content_dict(row)

    def get_by_legacy_tmdb_id(self, tmdb_id: int) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM content_items WHERE legacy_tmdb_id = ? LIMIT 1",
                (tmdb_id,),
            ).fetchone()
            return self._row_to_content_dict(row) if row else None

    @staticmethod
    def _row_to_content_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "watchmode_id": row["watchmode_id"],
            "imdb_id": row["imdb_id"],
            "legacy_tmdb_id": row["legacy_tmdb_id"],
            "title": row["title"],
            "original_title": row["original_title"],
            "content_type": row["content_type"],
            "watchmode_type": row["watchmode_type"],
            "is_documentary": bool(row["is_documentary"]),
            "release_year": row["release_year"],
            "release_date": row["release_date"],
            "description": row["description"],
            "poster_url": row["poster_url"],
            "backdrop_url": row["backdrop_url"],
            "genres": json.loads(row["genres_json"] or "[]"),
            "genre_ids": json.loads(row["genre_ids_json"] or "[]"),
            "runtime": row["runtime"],
            "rating": row["rating"],
            "rating_source": row["rating_source"],
            "popularity": row["popularity"],
            "language": row["language"],
            "country": row["country"],
            "cast": json.loads(row["cast_json"] or "[]"),
            "directors": json.loads(row["directors_json"] or "[]"),
            "streaming_sources": json.loads(row["streaming_sources_json"] or "[]"),
            "seasons": json.loads(row["seasons_json"] or "[]"),
            "episodes": json.loads(row["episodes_json"] or "[]"),
            "similar_title_ids": json.loads(row["similar_ids_json"] or "[]"),
            "trailer_url": row["trailer_url"],
            "has_full_details": bool(row["has_full_details"]),
            "last_synced_at": row["last_synced_at"],
            "cache_expires_at": row["cache_expires_at"],
        }


_db_manager: DatabaseManager | None = None


def get_db_manager() -> DatabaseManager:
    """Return shared DatabaseManager singleton."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager
