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
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
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

                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id TEXT PRIMARY KEY,
                    preferred_genres_json TEXT NOT NULL DEFAULT '[]',
                    disliked_genres_json TEXT NOT NULL DEFAULT '[]',
                    preferred_types_json TEXT NOT NULL DEFAULT '["MOVIE","TV_SERIES","DOCUMENTARY"]',
                    preferred_languages_json TEXT NOT NULL DEFAULT '[]',
                    min_rating REAL DEFAULT 6.5,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS user_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL DEFAULT 'local-default',
                    content_id INTEGER,
                    movielens_movie_id INTEGER,
                    title TEXT NOT NULL DEFAULT '',
                    feedback_type TEXT NOT NULL,
                    reason TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_feedback_user ON user_feedback(user_id);

                CREATE TABLE IF NOT EXISTS chat_sessions (
                    session_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'local-default',
                    state_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

                CREATE TABLE IF NOT EXISTS interaction_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL DEFAULT 'local-default',
                    content_id INTEGER,
                    movielens_movie_id INTEGER,
                    title TEXT NOT NULL DEFAULT '',
                    content_type TEXT NOT NULL DEFAULT '',
                    genres_json TEXT NOT NULL DEFAULT '[]',
                    interaction_type TEXT NOT NULL DEFAULT 'viewed',
                    progress_pct REAL DEFAULT 0.0,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_interaction_user ON interaction_history(user_id, created_at);

                CREATE TABLE IF NOT EXISTS analytics_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    user_id TEXT,
                    session_id TEXT,
                    content_id INTEGER,
                    title TEXT,
                    source_surface TEXT DEFAULT '',
                    dedupe_key TEXT DEFAULT '',
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_analytics_type_created ON analytics_events(event_type, created_at);
                CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_analytics_dedupe ON analytics_events(dedupe_key, created_at);
                """
            )
            existing_pref_cols = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(user_preferences)").fetchall()
            }
            migrations = {
                "favorite_themes_json": "TEXT NOT NULL DEFAULT '[]'",
                "preferred_era": "TEXT DEFAULT ''",
                "onboarding_completed": "INTEGER NOT NULL DEFAULT 0",
                "discovery_openness": "REAL DEFAULT 0.35",
            }
            for col_name, col_def in migrations.items():
                if col_name not in existing_pref_cols:
                    conn.execute(
                        f"ALTER TABLE user_preferences ADD COLUMN {col_name} {col_def}"
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


    # ------------------------------------------------------------------
    # Content / ID mapping lookup helpers
    # ------------------------------------------------------------------

    def get_content_by_imdb_id(self, imdb_id: str) -> dict[str, Any] | None:
        cleaned = (imdb_id or "").strip()
        if not cleaned:
            return None
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM content_items WHERE imdb_id = ? LIMIT 1",
                (cleaned,),
            ).fetchone()
            return self._row_to_content_dict(row) if row is not None else None

    def get_content_by_title(self, title: str, release_year: int | None = None) -> dict[str, Any] | None:
        cleaned = (title or "").strip()
        if not cleaned:
            return None
        with self.connection() as conn:
            if release_year is not None:
                row = conn.execute(
                    "SELECT * FROM content_items WHERE LOWER(title) = LOWER(?) AND release_year = ? LIMIT 1",
                    (cleaned, release_year),
                ).fetchone()
                if row is not None:
                    return self._row_to_content_dict(row)
            row = conn.execute(
                "SELECT * FROM content_items WHERE LOWER(title) = LOWER(?) LIMIT 1",
                (cleaned,),
            ).fetchone()
            return self._row_to_content_dict(row) if row is not None else None

    def search_local_content(
        self,
        *,
        query: str | None = None,
        content_type: str | None = None,
        genre: str | None = None,
        exclude_genres: list[str] | None = None,
        min_rating: float | None = None,
        year_min: int | None = None,
        year_max: int | None = None,
        max_runtime: int | None = None,
        language: str | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = ["poster_url IS NOT NULL"]
        params: list[Any] = []
        if content_type and content_type != "ALL":
            if content_type == "DOCUMENTARY":
                clauses.append("(content_type = 'DOCUMENTARY' OR is_documentary = 1)")
            else:
                clauses.append("content_type = ?")
                params.append(content_type)
        if genre:
            clauses.append("LOWER(genres_json) LIKE ?")
            params.append(f"%{genre.strip().lower()}%")
        for ex in exclude_genres or []:
            clauses.append("LOWER(genres_json) NOT LIKE ?")
            params.append(f"%{ex.strip().lower()}%")
        if min_rating is not None:
            clauses.append("rating IS NOT NULL AND rating >= ?")
            params.append(float(min_rating))
        if year_min is not None:
            clauses.append("release_year IS NOT NULL AND release_year >= ?")
            params.append(int(year_min))
        if year_max is not None:
            clauses.append("release_year IS NOT NULL AND release_year <= ?")
            params.append(int(year_max))
        if max_runtime is not None:
            clauses.append("runtime IS NOT NULL AND runtime > 0 AND runtime <= ?")
            params.append(int(max_runtime))
        if language:
            clauses.append("LOWER(language) = LOWER(?)")
            params.append(language.strip())
        if query:
            tokens = [t.strip().lower() for t in query.split() if len(t.strip()) >= 3][:4]
            if tokens:
                token_clauses = [
                    "(LOWER(title) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ? OR LOWER(genres_json) LIKE ?)"
                    for _ in tokens
                ]
                clauses.append("(" + " OR ".join(token_clauses) + ")")
                for tok in tokens:
                    like = f"%{tok}%"
                    params.extend([like, like, like])

        sql = (
            "SELECT * FROM content_items WHERE "
            + " AND ".join(clauses)
            + " ORDER BY COALESCE(popularity, 0) DESC, COALESCE(rating, 0) DESC LIMIT ?"
        )
        params.append(limit)
        with self.connection() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [self._row_to_content_dict(row) for row in rows]

    def list_mapping_entries_by_movielens_ids(self, ml_ids: list[int]) -> dict[int, dict[str, Any]]:
        if not ml_ids:
            return {}
        placeholders = ",".join("?" for _ in ml_ids)
        with self.connection() as conn:
            rows = conn.execute(
                f"SELECT * FROM id_mappings WHERE movielens_movie_id IN ({placeholders})",
                [int(x) for x in ml_ids],
            ).fetchall()
            return {int(row["movielens_movie_id"]): dict(row) for row in rows}

    def link_mapping_canonical_id(
        self,
        movielens_movie_id: int,
        canonical_content_id: int,
        watchmode_id: int | None = None,
    ) -> None:
        with self.connection() as conn:
            conn.execute(
                """
                UPDATE id_mappings
                SET canonical_content_id = ?,
                    watchmode_id = COALESCE(?, watchmode_id),
                    match_status = 'resolved',
                    mapped_at = ?
                WHERE movielens_movie_id = ?
                """,
                (canonical_content_id, watchmode_id, _utc_now_iso(), movielens_movie_id),
            )

    def get_movielens_id_for_content(
        self,
        *,
        content_id: int | None = None,
        imdb_id: str | None = None,
        legacy_tmdb_id: int | None = None,
        title: str | None = None,
    ) -> int | None:
        with self.connection() as conn:
            if content_id is not None:
                row = conn.execute(
                    "SELECT movielens_movie_id FROM id_mappings WHERE canonical_content_id = ? LIMIT 1",
                    (content_id,),
                ).fetchone()
                if row and row["movielens_movie_id"] is not None:
                    return int(row["movielens_movie_id"])
            if imdb_id:
                row = conn.execute(
                    "SELECT movielens_movie_id FROM id_mappings WHERE imdb_id = ? LIMIT 1",
                    (imdb_id.strip(),),
                ).fetchone()
                if row and row["movielens_movie_id"] is not None:
                    return int(row["movielens_movie_id"])
            if legacy_tmdb_id is not None:
                row = conn.execute(
                    "SELECT movielens_movie_id FROM id_mappings WHERE legacy_tmdb_id = ? LIMIT 1",
                    (legacy_tmdb_id,),
                ).fetchone()
                if row and row["movielens_movie_id"] is not None:
                    return int(row["movielens_movie_id"])
            if title:
                row = conn.execute(
                    "SELECT movielens_movie_id FROM id_mappings WHERE LOWER(title) = LOWER(?) LIMIT 1",
                    (title.strip(),),
                ).fetchone()
                if row and row["movielens_movie_id"] is not None:
                    return int(row["movielens_movie_id"])
        return None

    # ------------------------------------------------------------------
    # Watchlist CRUD (SQLite persisted, deduplicated per user & content)
    # ------------------------------------------------------------------

    def list_watchlist(self, user_id: str = "local-default") -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT w.*, c.genres_json, c.imdb_id, c.watchmode_id, c.is_documentary, c.description
                FROM watchlist_items w
                LEFT JOIN content_items c ON c.id = w.content_id OR c.watchmode_id = w.content_id
                WHERE w.user_id = ?
                GROUP BY w.id
                ORDER BY w.added_at DESC, w.id DESC
                """,
                (user_id,),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for row in rows:
                d = dict(row)
                d["genres"] = json.loads(d.pop("genres_json", None) or "[]")
                d["is_documentary"] = bool(d.get("is_documentary") or d.get("content_type") == "DOCUMENTARY")
                out.append(d)
            return out

    def upsert_watchlist_item(
        self,
        *,
        user_id: str = "local-default",
        content_id: int,
        title: str,
        content_type: str = "MOVIE",
        poster_url: str | None = None,
        release_year: int | None = None,
        rating: float | None = None,
        legacy_tmdb_id: int | None = None,
        reconciliation_status: str = "resolved",
    ) -> dict[str, Any]:
        now = _utc_now_iso()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO watchlist_items (
                    user_id, content_id, legacy_tmdb_id, title, content_type,
                    poster_url, release_year, rating, reconciliation_status, added_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, content_id) DO UPDATE SET
                    title = excluded.title,
                    content_type = excluded.content_type,
                    poster_url = COALESCE(excluded.poster_url, watchlist_items.poster_url),
                    release_year = COALESCE(excluded.release_year, watchlist_items.release_year),
                    rating = COALESCE(excluded.rating, watchlist_items.rating),
                    legacy_tmdb_id = COALESCE(excluded.legacy_tmdb_id, watchlist_items.legacy_tmdb_id),
                    reconciliation_status = excluded.reconciliation_status
                """,
                (
                    user_id,
                    content_id,
                    legacy_tmdb_id,
                    title,
                    content_type,
                    poster_url,
                    release_year,
                    rating,
                    reconciliation_status,
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM watchlist_items WHERE user_id = ? AND content_id = ?",
                (user_id, content_id),
            ).fetchone()
            return dict(row) if row is not None else {}

    def remove_watchlist_item(self, *, user_id: str = "local-default", content_id: int) -> bool:
        with self.connection() as conn:
            cur = conn.execute(
                "DELETE FROM watchlist_items WHERE user_id = ? AND content_id = ?",
                (user_id, content_id),
            )
            return cur.rowcount > 0

    def clear_watchlist(self, user_id: str = "local-default") -> int:
        with self.connection() as conn:
            cur = conn.execute("DELETE FROM watchlist_items WHERE user_id = ?", (user_id,))
            return cur.rowcount

    # ------------------------------------------------------------------
    # Collections CRUD
    # ------------------------------------------------------------------

    def list_collections_with_items(self, user_id: str = "local-default") -> list[dict[str, Any]]:
        with self.connection() as conn:
            cols = conn.execute(
                "SELECT * FROM collections WHERE user_id = ? ORDER BY created_at DESC, id DESC",
                (user_id,),
            ).fetchall()
            results: list[dict[str, Any]] = []
            for col in cols:
                cdict = dict(col)
                item_rows = conn.execute(
                    """
                    SELECT ci.content_id, ci.added_at,
                           COALESCE(c.title, w.title, 'Title #' || ci.content_id) AS title,
                           COALESCE(c.content_type, w.content_type, 'MOVIE') AS content_type,
                           COALESCE(c.poster_url, w.poster_url) AS poster_url,
                           COALESCE(c.release_year, w.release_year) AS release_year,
                           COALESCE(c.rating, w.rating) AS rating,
                           c.genres_json,
                           c.is_documentary
                    FROM collection_items ci
                    LEFT JOIN content_items c ON c.id = ci.content_id OR c.watchmode_id = ci.content_id
                    LEFT JOIN watchlist_items w ON w.content_id = ci.content_id AND w.user_id = ?
                    WHERE ci.collection_id = ?
                    GROUP BY ci.content_id
                    ORDER BY ci.added_at DESC, ci.id DESC
                    """,
                    (user_id, cdict["id"]),
                ).fetchall()
                items: list[dict[str, Any]] = []
                for ir in item_rows:
                    idict = dict(ir)
                    idict["genres"] = json.loads(idict.pop("genres_json", None) or "[]")
                    idict["is_documentary"] = bool(
                        idict.get("is_documentary") or idict.get("content_type") == "DOCUMENTARY"
                    )
                    items.append(idict)
                cdict["items"] = items
                cdict["item_count"] = len(items)
                results.append(cdict)
            return results

    def create_collection(
        self,
        *,
        user_id: str = "local-default",
        name: str,
        description: str = "",
    ) -> dict[str, Any]:
        now = _utc_now_iso()
        clean_name = name.strip()
        with self.connection() as conn:
            cur = conn.execute(
                "INSERT INTO collections (user_id, name, description, created_at) VALUES (?, ?, ?, ?)",
                (user_id, clean_name, description.strip(), now),
            )
            col_id = int(cur.lastrowid)
            row = conn.execute("SELECT * FROM collections WHERE id = ?", (col_id,)).fetchone()
            out = dict(row) if row is not None else {"id": col_id, "name": clean_name, "description": description}
            out["items"] = []
            out["item_count"] = 0
            return out

    def delete_collection(self, *, user_id: str = "local-default", collection_id: int) -> bool:
        with self.connection() as conn:
            cur = conn.execute(
                "DELETE FROM collections WHERE id = ? AND user_id = ?",
                (collection_id, user_id),
            )
            return cur.rowcount > 0

    def add_collection_item(
        self,
        *,
        user_id: str = "local-default",
        collection_id: int,
        content_id: int,
    ) -> bool:
        with self.connection() as conn:
            owner = conn.execute(
                "SELECT id FROM collections WHERE id = ? AND user_id = ?",
                (collection_id, user_id),
            ).fetchone()
            if owner is None:
                return False
            conn.execute(
                """
                INSERT OR IGNORE INTO collection_items (collection_id, content_id, added_at)
                VALUES (?, ?, ?)
                """,
                (collection_id, content_id, _utc_now_iso()),
            )
            return True

    def remove_collection_item(
        self,
        *,
        user_id: str = "local-default",
        collection_id: int,
        content_id: int,
    ) -> bool:
        with self.connection() as conn:
            owner = conn.execute(
                "SELECT id FROM collections WHERE id = ? AND user_id = ?",
                (collection_id, user_id),
            ).fetchone()
            if owner is None:
                return False
            cur = conn.execute(
                "DELETE FROM collection_items WHERE collection_id = ? AND content_id = ?",
                (collection_id, content_id),
            )
            return cur.rowcount > 0

    # ------------------------------------------------------------------
    # User Ratings, Preferences & Feedback CRUD
    # ------------------------------------------------------------------

    def list_user_ratings(self, user_id: str = "local-default") -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT r.*, c.title, c.content_type, c.poster_url, c.release_year,
                       c.genres_json, c.imdb_id, c.legacy_tmdb_id
                FROM user_ratings r
                LEFT JOIN content_items c ON c.id = r.content_id OR c.watchmode_id = r.content_id
                WHERE r.user_id = ?
                GROUP BY r.id
                ORDER BY r.rated_at DESC
                """,
                (user_id,),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for row in rows:
                d = dict(row)
                d["genres"] = json.loads(d.pop("genres_json", None) or "[]")
                out.append(d)
            return out

    def upsert_user_rating(
        self,
        *,
        user_id: str = "local-default",
        content_id: int,
        rating: float,
    ) -> dict[str, Any]:
        clamped = max(0.5, min(10.0, round(float(rating), 1)))
        now = _utc_now_iso()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO user_ratings (user_id, content_id, rating, rated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, content_id) DO UPDATE SET
                    rating = excluded.rating,
                    rated_at = excluded.rated_at
                """,
                (user_id, content_id, clamped, now),
            )
            row = conn.execute(
                "SELECT * FROM user_ratings WHERE user_id = ? AND content_id = ?",
                (user_id, content_id),
            ).fetchone()
            return dict(row) if row is not None else {}

    def delete_user_rating(self, *, user_id: str = "local-default", content_id: int) -> bool:
        with self.connection() as conn:
            cur = conn.execute(
                "DELETE FROM user_ratings WHERE user_id = ? AND content_id = ?",
                (user_id, content_id),
            )
            return cur.rowcount > 0

    def get_user_preferences(self, user_id: str = "local-default") -> dict[str, Any]:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM user_preferences WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if row is None:
                return {
                    "user_id": user_id,
                    "preferred_genres": [],
                    "disliked_genres": [],
                    "preferred_types": ["MOVIE", "TV_SERIES", "DOCUMENTARY"],
                    "preferred_languages": [],
                    "min_rating": 6.5,
                    "favorite_themes": [],
                    "preferred_era": "",
                    "onboarding_completed": False,
                    "discovery_openness": 0.35,
                    "updated_at": None,
                }
            row_keys = set(row.keys())
            return {
                "user_id": row["user_id"],
                "preferred_genres": json.loads(row["preferred_genres_json"] or "[]"),
                "disliked_genres": json.loads(row["disliked_genres_json"] or "[]"),
                "preferred_types": json.loads(row["preferred_types_json"] or '["MOVIE","TV_SERIES","DOCUMENTARY"]'),
                "preferred_languages": json.loads(row["preferred_languages_json"] or "[]"),
                "min_rating": row["min_rating"],
                "favorite_themes": json.loads(row["favorite_themes_json"] or "[]")
                if "favorite_themes_json" in row_keys
                else [],
                "preferred_era": (row["preferred_era"] or "") if "preferred_era" in row_keys else "",
                "onboarding_completed": bool(row["onboarding_completed"])
                if "onboarding_completed" in row_keys
                else False,
                "discovery_openness": float(row["discovery_openness"])
                if "discovery_openness" in row_keys and row["discovery_openness"] is not None
                else 0.35,
                "updated_at": row["updated_at"],
            }

    def upsert_user_preferences(
        self,
        *,
        user_id: str = "local-default",
        preferred_genres: list[str] | None = None,
        disliked_genres: list[str] | None = None,
        preferred_types: list[str] | None = None,
        preferred_languages: list[str] | None = None,
        min_rating: float | None = None,
        favorite_themes: list[str] | None = None,
        preferred_era: str | None = None,
        onboarding_completed: bool | None = None,
        discovery_openness: float | None = None,
    ) -> dict[str, Any]:
        current = self.get_user_preferences(user_id)
        new_prefs = {
            "preferred_genres": preferred_genres if preferred_genres is not None else current["preferred_genres"],
            "disliked_genres": disliked_genres if disliked_genres is not None else current["disliked_genres"],
            "preferred_types": preferred_types if preferred_types is not None else current["preferred_types"],
            "preferred_languages": (
                preferred_languages if preferred_languages is not None else current["preferred_languages"]
            ),
            "min_rating": min_rating if min_rating is not None else current["min_rating"],
            "favorite_themes": favorite_themes if favorite_themes is not None else current["favorite_themes"],
            "preferred_era": preferred_era if preferred_era is not None else current["preferred_era"],
            "onboarding_completed": (
                onboarding_completed
                if onboarding_completed is not None
                else current["onboarding_completed"]
            ),
            "discovery_openness": (
                discovery_openness if discovery_openness is not None else current["discovery_openness"]
            ),
        }
        now = _utc_now_iso()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO user_preferences (
                    user_id, preferred_genres_json, disliked_genres_json,
                    preferred_types_json, preferred_languages_json, min_rating,
                    favorite_themes_json, preferred_era, onboarding_completed,
                    discovery_openness, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    preferred_genres_json = excluded.preferred_genres_json,
                    disliked_genres_json = excluded.disliked_genres_json,
                    preferred_types_json = excluded.preferred_types_json,
                    preferred_languages_json = excluded.preferred_languages_json,
                    min_rating = excluded.min_rating,
                    favorite_themes_json = excluded.favorite_themes_json,
                    preferred_era = excluded.preferred_era,
                    onboarding_completed = excluded.onboarding_completed,
                    discovery_openness = excluded.discovery_openness,
                    updated_at = excluded.updated_at
                """,
                (
                    user_id,
                    json.dumps(new_prefs["preferred_genres"]),
                    json.dumps(new_prefs["disliked_genres"]),
                    json.dumps(new_prefs["preferred_types"]),
                    json.dumps(new_prefs["preferred_languages"]),
                    new_prefs["min_rating"],
                    json.dumps(new_prefs["favorite_themes"]),
                    new_prefs["preferred_era"],
                    1 if new_prefs["onboarding_completed"] else 0,
                    new_prefs["discovery_openness"],
                    now,
                ),
            )
        return self.get_user_preferences(user_id)

    def add_user_feedback(
        self,
        *,
        user_id: str = "local-default",
        feedback_type: str,
        content_id: int | None = None,
        movielens_movie_id: int | None = None,
        title: str = "",
        reason: str = "",
    ) -> dict[str, Any]:
        now = _utc_now_iso()
        with self.connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO user_feedback (
                    user_id, content_id, movielens_movie_id, title, feedback_type, reason, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, content_id, movielens_movie_id, title, feedback_type, reason, now),
            )
            fid = int(cur.lastrowid)
            row = conn.execute("SELECT * FROM user_feedback WHERE id = ?", (fid,)).fetchone()
            return dict(row) if row is not None else {}

    def list_user_feedback(self, user_id: str = "local-default", limit: int = 200) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM user_feedback WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # MIRA Conversational Memory CRUD
    # ------------------------------------------------------------------

    def get_chat_session(self, session_id: str, user_id: str = "local-default") -> dict[str, Any]:
        now = _utc_now_iso()
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM chat_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO chat_sessions (session_id, user_id, state_json, created_at, updated_at)
                    VALUES (?, ?, '{}', ?, ?)
                    """,
                    (session_id, user_id, now, now),
                )
                return {
                    "session_id": session_id,
                    "user_id": user_id,
                    "state": {},
                    "created_at": now,
                    "updated_at": now,
                }
            return {
                "session_id": row["session_id"],
                "user_id": row["user_id"],
                "state": json.loads(row["state_json"] or "{}"),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }

    def save_chat_session_state(
        self,
        session_id: str,
        state: dict[str, Any],
        user_id: str = "local-default",
    ) -> None:
        now = _utc_now_iso()
        self.get_chat_session(session_id, user_id=user_id)
        with self.connection() as conn:
            conn.execute(
                "UPDATE chat_sessions SET state_json = ?, updated_at = ? WHERE session_id = ?",
                (json.dumps(state), now, session_id),
            )

    def append_chat_message(
        self,
        *,
        session_id: str,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        user_id: str = "local-default",
    ) -> dict[str, Any]:
        now = _utc_now_iso()
        self.get_chat_session(session_id, user_id=user_id)
        with self.connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, role, content, json.dumps(metadata or {}), now),
            )
            conn.execute(
                "UPDATE chat_sessions SET updated_at = ? WHERE session_id = ?",
                (now, session_id),
            )
            mid = int(cur.lastrowid)
            return {
                "id": mid,
                "session_id": session_id,
                "role": role,
                "content": content,
                "metadata": metadata or {},
                "created_at": now,
            }

    def list_chat_messages(self, session_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM (
                    SELECT * FROM chat_messages
                    WHERE session_id = ?
                    ORDER BY id DESC
                    LIMIT ?
                ) sub
                ORDER BY id ASC
                """,
                (session_id, limit),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                out.append(
                    {
                        "id": r["id"],
                        "session_id": r["session_id"],
                        "role": r["role"],
                        "content": r["content"],
                        "metadata": json.loads(r["metadata_json"] or "{}"),
                        "created_at": r["created_at"],
                    }
                )
            return out

    def clear_chat_session(self, session_id: str, user_id: str = "local-default") -> None:
        now = _utc_now_iso()
        with self.connection() as conn:
            conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
            conn.execute(
                """
                INSERT INTO chat_sessions (session_id, user_id, state_json, created_at, updated_at)
                VALUES (?, ?, '{}', ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    state_json = '{}',
                    updated_at = excluded.updated_at
                """,
                (session_id, user_id, now, now),
            )

    # ------------------------------------------------------------------
    # Day 5: Interaction History & Personalization Reset
    # ------------------------------------------------------------------

    def record_interaction(
        self,
        *,
        user_id: str = "local-default",
        content_id: int | None = None,
        movielens_movie_id: int | None = None,
        title: str = "",
        content_type: str = "",
        genres: list[str] | None = None,
        interaction_type: str = "viewed",
        progress_pct: float = 0.0,
    ) -> dict[str, Any]:
        """Record a user browsing, watch-progress, or click interaction strictly scoped by user_id."""
        now = _utc_now_iso()
        resolved_title = title
        resolved_type = content_type
        resolved_genres = list(genres or [])
        resolved_ml_id = movielens_movie_id

        if content_id is not None:
            content_row = self.get_content_by_any_id(content_id)
            if content_row is not None:
                if not resolved_title:
                    resolved_title = str(content_row.get("title") or "")
                if not resolved_type:
                    resolved_type = str(content_row.get("content_type") or "")
                if not resolved_genres:
                    resolved_genres = list(content_row.get("genres") or [])
            if resolved_ml_id is None:
                resolved_ml_id = self.get_movielens_id_for_content(content_id=content_id)

        clamped_progress = max(0.0, min(100.0, float(progress_pct or 0.0)))
        with self.connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO interaction_history (
                    user_id, content_id, movielens_movie_id, title,
                    content_type, genres_json, interaction_type, progress_pct, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    content_id,
                    resolved_ml_id,
                    resolved_title,
                    resolved_type,
                    json.dumps(resolved_genres),
                    interaction_type,
                    clamped_progress,
                    now,
                ),
            )
            iid = int(cur.lastrowid)
            row = conn.execute("SELECT * FROM interaction_history WHERE id = ?", (iid,)).fetchone()
            if row is None:
                return {}
            return {
                "id": row["id"],
                "user_id": row["user_id"],
                "content_id": row["content_id"],
                "movielens_movie_id": row["movielens_movie_id"],
                "title": row["title"],
                "content_type": row["content_type"],
                "genres": json.loads(row["genres_json"] or "[]"),
                "interaction_type": row["interaction_type"],
                "progress_pct": float(row["progress_pct"] or 0.0),
                "created_at": row["created_at"],
            }

    def list_interactions(self, user_id: str = "local-default", limit: int = 200) -> list[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM interaction_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                out.append(
                    {
                        "id": r["id"],
                        "user_id": r["user_id"],
                        "content_id": r["content_id"],
                        "movielens_movie_id": r["movielens_movie_id"],
                        "title": r["title"],
                        "content_type": r["content_type"],
                        "genres": json.loads(r["genres_json"] or "[]"),
                        "interaction_type": r["interaction_type"],
                        "progress_pct": float(r["progress_pct"] or 0.0),
                        "created_at": r["created_at"],
                    }
                )
            return out

    def list_continue_exploring(self, user_id: str = "local-default", limit: int = 10) -> list[dict[str, Any]]:
        """Return latest unfinished progress or recently viewed items joined with content_items when cached."""
        interactions = self.list_interactions(user_id=user_id, limit=200)
        seen_keys: set[str] = set()
        results: list[dict[str, Any]] = []
        for item in interactions:
            cid = item.get("content_id")
            title = (item.get("title") or "").strip()
            key = f"cid:{cid}" if cid is not None else f"t:{title.lower()}"
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            progress = float(item.get("progress_pct") or 0.0)
            itype = item.get("interaction_type") or "viewed"
            # Skip completed (>= 95%) titles from "Continue Exploring"
            if itype == "progress" and progress >= 95.0:
                continue
            cached = self.get_content_by_any_id(cid) if cid is not None else None
            results.append({"interaction": item, "content": cached})
            if len(results) >= limit:
                break
        return results

    def list_recent_mira_constraints(self, user_id: str = "local-default", limit: int = 10) -> list[dict[str, Any]]:
        """Return recent MIRA session state snapshots for an isolated user_id."""
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT session_id, state_json, updated_at
                FROM chat_sessions
                WHERE user_id = ?
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
            out: list[dict[str, Any]] = []
            for r in rows:
                try:
                    parsed = json.loads(r["state_json"] or "{}")
                except json.JSONDecodeError:
                    parsed = {}
                if parsed:
                    out.append({"session_id": r["session_id"], "state": parsed, "updated_at": r["updated_at"]})
            return out

    def reset_user_personalization(self, user_id: str = "local-default") -> dict[str, int]:
        """Clear preferences, ratings, feedback, interactions, and MIRA chat memory for a specific user_id."""
        with self.connection() as conn:
            c_prefs = conn.execute("DELETE FROM user_preferences WHERE user_id = ?", (user_id,)).rowcount
            c_fb = conn.execute("DELETE FROM user_feedback WHERE user_id = ?", (user_id,)).rowcount
            c_int = conn.execute("DELETE FROM interaction_history WHERE user_id = ?", (user_id,)).rowcount
            c_rat = conn.execute("DELETE FROM user_ratings WHERE user_id = ?", (user_id,)).rowcount
            session_ids = [
                r["session_id"]
                for r in conn.execute("SELECT session_id FROM chat_sessions WHERE user_id = ?", (user_id,)).fetchall()
            ]
            c_msg = 0
            for sid in session_ids:
                c_msg += conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (sid,)).rowcount
            c_sess = conn.execute("DELETE FROM chat_sessions WHERE user_id = ?", (user_id,)).rowcount
            return {
                "preferences_cleared": c_prefs,
                "feedback_cleared": c_fb,
                "interactions_cleared": c_int,
                "ratings_cleared": c_rat,
                "chat_sessions_cleared": c_sess,
                "chat_messages_cleared": c_msg,
            }

    @staticmethod
    def _sanitize_analytics_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
        if not metadata or not isinstance(metadata, dict):
            return {}
        blocked_substrings = (
            "password",
            "token",
            "secret",
            "api_key",
            "apikey",
            "authorization",
            "cookie",
            "credential",
            "private_chat",
            "chat_log",
        )
        sanitized: dict[str, Any] = {}
        for idx, (raw_key, raw_val) in enumerate(metadata.items()):
            if idx >= 24:
                break
            key = str(raw_key)[:64]
            lower_key = key.lower()
            if any(bad in lower_key for bad in blocked_substrings):
                continue
            if isinstance(raw_val, (int, float, bool)) or raw_val is None:
                sanitized[key] = raw_val
            elif isinstance(raw_val, str):
                sanitized[key] = raw_val[:240]
            elif isinstance(raw_val, list):
                sanitized[key] = [str(item)[:80] for item in raw_val[:12]]
            else:
                sanitized[key] = str(raw_val)[:240]
        return sanitized

    def record_analytics_event(
        self,
        *,
        event_type: str,
        user_id: str | None = None,
        session_id: str | None = None,
        content_id: int | None = None,
        title: str | None = None,
        source_surface: str = "",
        dedupe_key: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()
        window_cutoff = (now_dt - timedelta(seconds=5)).isoformat()
        clean_meta = self._sanitize_analytics_metadata(metadata)
        clean_dedupe = (dedupe_key or "").strip()[:180]
        clean_title = (title or "").strip()[:200] or None
        clean_surface = (source_surface or "").strip()[:80]
        clean_user = (user_id or "").strip()[:100] or None
        clean_session = (session_id or "").strip()[:100] or None

        with self.connection() as conn:
            if clean_dedupe:
                existing = conn.execute(
                    """
                    SELECT id FROM analytics_events
                    WHERE dedupe_key = ? AND created_at >= ?
                    ORDER BY id DESC LIMIT 1
                    """,
                    (clean_dedupe, window_cutoff),
                ).fetchone()
                if existing:
                    return {
                        "recorded": False,
                        "deduped": True,
                        "event_id": int(existing["id"]),
                    }

            cur = conn.execute(
                """
                INSERT INTO analytics_events (
                    event_type, user_id, session_id, content_id, title,
                    source_surface, dedupe_key, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_type,
                    clean_user,
                    clean_session,
                    content_id,
                    clean_title,
                    clean_surface,
                    clean_dedupe,
                    json.dumps(clean_meta),
                    now_iso,
                ),
            )
            return {
                "recorded": True,
                "deduped": False,
                "event_id": int(cur.lastrowid) if cur.lastrowid else None,
            }

    def get_admin_analytics(self, days: int | None = 7) -> dict[str, Any]:
        cutoff_iso: str | None = None
        if days is not None and days > 0:
            cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        where_clause = "WHERE created_at >= ?" if cutoff_iso else ""
        params: tuple[Any, ...] = (cutoff_iso,) if cutoff_iso else ()

        with self.connection() as conn:
            counts_rows = conn.execute(
                f"""
                SELECT event_type, COUNT(*) AS cnt
                FROM analytics_events
                {where_clause}
                GROUP BY event_type
                """,
                params,
            ).fetchall()
            counts = {row["event_type"]: int(row["cnt"]) for row in counts_rows}

            totals_row = conn.execute(
                f"""
                SELECT
                    COUNT(*) AS total_events,
                    COUNT(DISTINCT CASE WHEN user_id IS NOT NULL AND user_id != '' THEN user_id END) AS unique_users,
                    COUNT(DISTINCT CASE WHEN session_id IS NOT NULL AND session_id != '' THEN session_id END) AS unique_sessions
                FROM analytics_events
                {where_clause}
                """,
                params,
            ).fetchone()

            watchlist_count = int(
                conn.execute(
                    f"SELECT COUNT(*) AS cnt FROM watchlist_items {('WHERE added_at >= ?' if cutoff_iso else '')}",
                    params,
                ).fetchone()["cnt"]
            )
            collections_count = int(
                conn.execute(
                    f"SELECT COUNT(*) AS cnt FROM collections {('WHERE created_at >= ?' if cutoff_iso else '')}",
                    params,
                ).fetchone()["cnt"]
            )
            mira_msg_count = int(
                conn.execute(
                    f"SELECT COUNT(*) AS cnt FROM chat_messages {where_clause}",
                    params,
                ).fetchone()["cnt"]
            )
            api_credits_used = int(
                conn.execute(
                    f"SELECT COALESCE(SUM(credits_spent), 0) AS cnt FROM api_credit_usage {('WHERE recorded_at >= ?' if cutoff_iso else '')}",
                    params,
                ).fetchone()["cnt"]
            )

            top_viewed_rows = conn.execute(
                f"""
                SELECT content_id, COALESCE(MAX(NULLIF(title, '')), 'Untitled') AS title, COUNT(*) AS views
                FROM analytics_events
                WHERE event_type = 'content_viewed'
                {('AND created_at >= ?' if cutoff_iso else '')}
                GROUP BY COALESCE(CAST(content_id AS TEXT), title)
                ORDER BY views DESC
                LIMIT 8
                """,
                params,
            ).fetchall()

            search_rows = conn.execute(
                f"""
                SELECT metadata_json FROM analytics_events
                WHERE event_type = 'content_searched'
                {('AND created_at >= ?' if cutoff_iso else '')}
                ORDER BY id DESC LIMIT 500
                """,
                params,
            ).fetchall()
            query_counts: dict[str, int] = {}
            for row in search_rows:
                try:
                    meta = json.loads(row["metadata_json"] or "{}")
                except json.JSONDecodeError:
                    meta = {}
                q = str(meta.get("query") or "").strip().lower()
                if q:
                    query_counts[q] = query_counts.get(q, 0) + 1
            top_searches = [
                {"query": q, "count": c}
                for q, c in sorted(query_counts.items(), key=lambda x: (-x[1], x[0]))[:8]
            ]

            filter_rows = conn.execute(
                f"""
                SELECT metadata_json FROM analytics_events
                WHERE event_type = 'discover_filters_used'
                {('AND created_at >= ?' if cutoff_iso else '')}
                ORDER BY id DESC LIMIT 500
                """,
                params,
            ).fetchall()
            filter_counts: dict[str, int] = {}
            genre_counts: dict[str, int] = {}
            for row in filter_rows:
                try:
                    meta = json.loads(row["metadata_json"] or "{}")
                except json.JSONDecodeError:
                    meta = {}
                for fname in ("media_type", "genre", "sort_by", "language"):
                    val = str(meta.get(fname) or "").strip()
                    if val and val.lower() not in ("all", "default", "none", ""):
                        label = f"{fname}:{val}"
                        filter_counts[label] = filter_counts.get(label, 0) + 1
                        if fname == "genre":
                            genre_counts[val] = genre_counts.get(val, 0) + 1

            # Also include genres from content_viewed metadata if recorded
            viewed_meta_rows = conn.execute(
                f"""
                SELECT metadata_json FROM analytics_events
                WHERE event_type = 'content_viewed'
                {('AND created_at >= ?' if cutoff_iso else '')}
                ORDER BY id DESC LIMIT 500
                """,
                params,
            ).fetchall()
            for row in viewed_meta_rows:
                try:
                    meta = json.loads(row["metadata_json"] or "{}")
                except json.JSONDecodeError:
                    meta = {}
                genres = meta.get("genres")
                if isinstance(genres, list):
                    for g in genres:
                        gs = str(g).strip()
                        if gs:
                            genre_counts[gs] = genre_counts.get(gs, 0) + 1

            feedback_rows = conn.execute(
                f"""
                SELECT metadata_json FROM analytics_events
                WHERE event_type = 'recommendation_feedback'
                {('AND created_at >= ?' if cutoff_iso else '')}
                """,
                params,
            ).fetchall()
            likes = 0
            dislikes = 0
            for row in feedback_rows:
                try:
                    meta = json.loads(row["metadata_json"] or "{}")
                except json.JSONDecodeError:
                    meta = {}
                val = str(meta.get("feedback") or meta.get("action") or "").lower()
                if val in ("like", "liked", "up"):
                    likes += 1
                elif val in ("dislike", "disliked", "down"):
                    dislikes += 1

            mira_events = conn.execute(
                f"""
                SELECT metadata_json, source_surface, event_type FROM analytics_events
                WHERE event_type IN ('mira_conversation_started', 'recommendation_clicked')
                {('AND created_at >= ?' if cutoff_iso else '')}
                ORDER BY id DESC LIMIT 500
                """,
                params,
            ).fetchall()
            intent_counts: dict[str, int] = {}
            mira_rec_clicks = 0
            for row in mira_events:
                if row["event_type"] == "recommendation_clicked":
                    if "mira" in str(row["source_surface"] or "").lower():
                        mira_rec_clicks += 1
                    continue
                try:
                    meta = json.loads(row["metadata_json"] or "{}")
                except json.JSONDecodeError:
                    meta = {}
                intent = str(meta.get("intent") or "").strip()
                if intent:
                    intent_counts[intent] = intent_counts.get(intent, 0) + 1

            daily_rows = conn.execute(
                f"""
                SELECT
                    substr(created_at, 1, 10) AS day,
                    SUM(CASE WHEN event_type = 'content_viewed' THEN 1 ELSE 0 END) AS views,
                    SUM(CASE WHEN event_type = 'content_searched' THEN 1 ELSE 0 END) AS searches,
                    SUM(CASE WHEN event_type IN ('recommendation_displayed', 'recommendation_clicked') THEN 1 ELSE 0 END) AS recommendations,
                    SUM(CASE WHEN event_type = 'mira_conversation_started' THEN 1 ELSE 0 END) AS mira
                FROM analytics_events
                {where_clause}
                GROUP BY substr(created_at, 1, 10)
                ORDER BY day ASC
                LIMIT 31
                """,
                params,
            ).fetchall()

        recs_displayed = counts.get("recommendation_displayed", 0)
        recs_clicked = counts.get("recommendation_clicked", 0)
        ctr_pct = round((recs_clicked / recs_displayed) * 100, 2) if recs_displayed > 0 else None
        total_fb = likes + dislikes
        like_ratio_pct = round((likes / total_fb) * 100, 2) if total_fb > 0 else None

        return {
            "days": days,
            "generated_at": _utc_now_iso(),
            "platform_overview": {
                "total_events": int(totals_row["total_events"]) if totals_row else 0,
                "unique_users": int(totals_row["unique_users"]) if totals_row else 0,
                "unique_sessions": int(totals_row["unique_sessions"]) if totals_row else 0,
                "active_watchlist_items": watchlist_count,
                "total_collections": collections_count,
                "total_searches": counts.get("content_searched", 0),
                "total_content_views": counts.get("content_viewed", 0),
                "mira_conversations_started": counts.get("mira_conversation_started", 0),
                "api_credits_used": api_credits_used,
            },
            "content_analytics": {
                "top_viewed_content": [
                    {
                        "content_id": row["content_id"],
                        "title": row["title"],
                        "views": int(row["views"]),
                    }
                    for row in top_viewed_rows
                ],
                "top_searched_queries": top_searches,
                "top_genres": [
                    {"genre": g, "count": c}
                    for g, c in sorted(genre_counts.items(), key=lambda x: (-x[1], x[0]))[:8]
                ],
                "discover_filter_usage": [
                    {"filter": f, "count": c}
                    for f, c in sorted(filter_counts.items(), key=lambda x: (-x[1], x[0]))[:8]
                ],
                "streaming_checks": counts.get("streaming_availability_checked", 0),
            },
            "recommendation_analytics": {
                "recommendations_displayed": recs_displayed,
                "recommendations_clicked": recs_clicked,
                "ctr_pct": ctr_pct,
                "likes": likes,
                "dislikes": dislikes,
                "like_ratio_pct": like_ratio_pct,
            },
            "mira_analytics": {
                "conversations_started": counts.get("mira_conversation_started", 0),
                "total_messages": mira_msg_count,
                "recommendation_clicks_from_mira": mira_rec_clicks,
                "top_intents": [
                    {"intent": k, "count": v}
                    for k, v in sorted(intent_counts.items(), key=lambda x: (-x[1], x[0]))[:6]
                ],
            },
            "event_breakdown": counts,
            "daily_activity": [
                {
                    "date": row["day"],
                    "views": int(row["views"]),
                    "searches": int(row["searches"]),
                    "recommendations": int(row["recommendations"]),
                    "mira": int(row["mira"]),
                }
                for row in daily_rows
            ],
        }


_db_manager: DatabaseManager | None = None


def get_db_manager() -> DatabaseManager:
    """Return shared DatabaseManager singleton."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager
