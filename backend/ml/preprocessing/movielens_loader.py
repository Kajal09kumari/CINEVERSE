"""
MovieLens Dataset Loader & Preprocessor (ml-latest-small / ml-32m compatible).

Downloads GroupLens `ml-latest-small.zip` (~1 MB, 9,742 movies, 100,836 ratings,
3,683 community tags, and IMDb/TMDB cross-links) on demand if not already present
under `backend/ml/data/raw/`, parses and cleans metadata, computes Bayesian item
quality anchors, and syncs IMDb ID mappings into SQLite `id_mappings`.
"""

from __future__ import annotations

import logging
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from app.core.config import settings
from app.db.database import DatabaseManager, get_db_manager

logger = logging.getLogger(__name__)

MOVIELENS_SMALL_URL = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"
_YEAR_REGEX = re.compile(r"\((\d{4})\)\s*$")


@dataclass(frozen=True)
class MovieLensDataset:
    """In-memory cleaned MovieLens tables ready for model training/inference."""

    dataset_name: str
    movies_df: pd.DataFrame
    ratings_df: pd.DataFrame
    tags_df: pd.DataFrame
    links_df: pd.DataFrame
    stats: dict[str, int | float | str]


def _resolve_dataset_folder(base_dir: Path | None = None) -> Path | None:
    """Locate extracted MovieLens CSV directory (`ml-latest-small`, `ml-32m`, or root raw dir)."""
    root = (base_dir or settings.resolved_movielens_dir).resolve()
    if not root.exists():
        return None
    for candidate in (root / "ml-32m", root / "ml-latest-small", root):
        if (candidate / "movies.csv").exists() and (candidate / "ratings.csv").exists():
            return candidate
    return None


def ensure_movielens_downloaded(base_dir: Path | None = None) -> Path:
    """Ensure MovieLens CSVs exist locally, downloading `ml-latest-small.zip` if absent."""
    existing = _resolve_dataset_folder(base_dir)
    if existing is not None:
        return existing

    root = (base_dir or settings.resolved_movielens_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    zip_path = root / "ml-latest-small.zip"

    logger.info("Downloading MovieLens ml-latest-small dataset to %s", zip_path)
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        resp = client.get(MOVIELENS_SMALL_URL)
        resp.raise_for_status()
        zip_path.write_bytes(resp.content)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(root)

    try:
        zip_path.unlink(missing_ok=True)
    except OSError:
        pass

    resolved = _resolve_dataset_folder(root)
    if resolved is None:
        raise RuntimeError(f"Failed to locate extracted MovieLens CSVs under {root}")
    return resolved


def _extract_title_and_year(raw_title: str) -> tuple[str, int | None]:
    text = str(raw_title or "").strip()
    match = _YEAR_REGEX.search(text)
    if not match:
        return text, None
    year = int(match.group(1))
    clean = _YEAR_REGEX.sub("", text).strip()
    # Handle "Matrix, The" -> "The Matrix"
    if clean.endswith(", The"):
        clean = "The " + clean[:-5].strip()
    elif clean.endswith(", A"):
        clean = "A " + clean[:-3].strip()
    elif clean.endswith(", An"):
        clean = "An " + clean[:-4].strip()
    return clean, year


def _normalize_imdb_id(val: object) -> str | None:
    if pd.isna(val):
        return None
    digits = re.sub(r"\D", "", str(val).split(".")[0])
    if not digits:
        return None
    return f"tt{digits.zfill(7)}"


def load_movielens_dataset(
    base_dir: Path | None = None,
    *,
    auto_download: bool = True,
    max_ratings: int | None = None,
) -> MovieLensDataset:
    """Load, clean, and enrich MovieLens DataFrames with tags and rating aggregates."""
    folder = _resolve_dataset_folder(base_dir)
    if folder is None:
        if not auto_download:
            raise FileNotFoundError(
                f"MovieLens dataset not found in {base_dir or settings.resolved_movielens_dir}"
            )
        folder = ensure_movielens_downloaded(base_dir)

    movies = pd.read_csv(folder / "movies.csv")
    ratings = pd.read_csv(folder / "ratings.csv")
    if max_ratings and len(ratings) > max_ratings:
        ratings = ratings.sample(n=max_ratings, random_state=42)

    links_path = folder / "links.csv"
    links = pd.read_csv(links_path) if links_path.exists() else pd.DataFrame(columns=["movieId", "imdbId", "tmdbId"])

    tags_path = folder / "tags.csv"
    tags = pd.read_csv(tags_path) if tags_path.exists() else pd.DataFrame(columns=["userId", "movieId", "tag", "timestamp"])

    # Clean titles & extract release_year
    parsed = movies["title"].map(_extract_title_and_year)
    movies["clean_title"] = parsed.map(lambda p: p[0])
    movies["release_year"] = parsed.map(lambda p: p[1])
    movies["genres_clean"] = (
        movies["genres"]
        .fillna("")
        .astype(str)
        .map(lambda g: [] if g in ("", "(no genres listed)") else [x.strip() for x in g.split("|") if x.strip()])
    )
    movies["is_documentary"] = movies["genres_clean"].map(lambda gs: "Documentary" in gs)

    # Aggregate tags per movieId
    if not tags.empty and "tag" in tags.columns:
        tags_clean = tags.dropna(subset=["movieId", "tag"]).copy()
        tags_clean["tag"] = tags_clean["tag"].astype(str).str.strip().str.lower()
        tag_agg = (
            tags_clean.groupby("movieId")["tag"]
            .apply(lambda s: " ".join(dict.fromkeys(s.tolist())))
            .reset_index()
            .rename(columns={"tag": "community_tags"})
        )
    else:
        tag_agg = pd.DataFrame({"movieId": movies["movieId"], "community_tags": ""})

    # Rating aggregates & Bayesian weighted rating (scale converted 0-5 -> 0-10 for display)
    rating_agg = (
        ratings.groupby("movieId")["rating"]
        .agg(rating_count="count", rating_mean="mean")
        .reset_index()
    )
    global_mean = float(ratings["rating"].mean()) if len(ratings) else 3.5
    min_votes_prior = 20.0

    movies = movies.merge(tag_agg, on="movieId", how="left")
    movies["community_tags"] = movies["community_tags"].fillna("")
    movies = movies.merge(rating_agg, on="movieId", how="left")
    movies["rating_count"] = movies["rating_count"].fillna(0).astype(int)
    movies["rating_mean"] = movies["rating_mean"].fillna(global_mean).astype(float)

    v = movies["rating_count"].astype(float)
    r = movies["rating_mean"].astype(float)
    weighted_5 = (v / (v + min_votes_prior)) * r + (min_votes_prior / (v + min_votes_prior)) * global_mean
    movies["weighted_rating_5"] = weighted_5
    movies["weighted_rating_10"] = np.round(weighted_5 * 2.0, 2)

    # Merge IMDb/legacy IDs cleanly
    if not links.empty:
        links = links.copy()
        links["imdb_id"] = links["imdbId"].map(_normalize_imdb_id)
        if "tmdbId" in links.columns:
            links["legacy_tmdb_id"] = pd.to_numeric(links["tmdbId"], errors="coerce").astype("Int64")
        else:
            links["legacy_tmdb_id"] = pd.Series([pd.NA] * len(links), dtype="Int64")
        movies = movies.merge(links[["movieId", "imdb_id", "legacy_tmdb_id"]], on="movieId", how="left")
    else:
        movies["imdb_id"] = None
        movies["legacy_tmdb_id"] = pd.NA

    movies["content_type"] = movies["is_documentary"].map(lambda is_doc: "DOCUMENTARY" if is_doc else "MOVIE")
    movies["soup"] = (
        movies["clean_title"].fillna("")
        + " "
        + movies["genres_clean"].map(lambda gs: " ".join(gs * 2))
        + " "
        + movies["community_tags"].fillna("")
    ).str.strip()

    stats: dict[str, int | float | str] = {
        "dataset": folder.name,
        "total_movies": int(len(movies)),
        "total_ratings": int(len(ratings)),
        "total_users": int(ratings["userId"].nunique()) if not ratings.empty else 0,
        "total_tags": int(len(tags)),
        "global_mean_rating_5": round(global_mean, 4),
    }
    return MovieLensDataset(
        dataset_name=folder.name,
        movies_df=movies,
        ratings_df=ratings,
        tags_df=tags,
        links_df=links,
        stats=stats,
    )


def sync_movielens_links_to_db(
    dataset: MovieLensDataset,
    db: DatabaseManager | None = None,
) -> dict[str, int]:
    """
    Sync MovieLens IMDb cross-references into SQLite `id_mappings` and link any
    matching titles already stored in `content_items`.
    """
    database = db or get_db_manager()
    rows_upserted = 0
    matched_canonical = 0

    df = dataset.movies_df
    with database.connection() as conn:
        # Lookup existing cached content items by imdb_id or legacy_tmdb_id
        imdb_to_content: dict[str, tuple[int, int | None]] = {}
        tmdb_to_content: dict[int, tuple[int, int | None]] = {}
        for c_row in conn.execute(
            "SELECT id, imdb_id, legacy_tmdb_id, watchmode_id FROM content_items"
        ).fetchall():
            if c_row["imdb_id"]:
                imdb_to_content[str(c_row["imdb_id"])] = (int(c_row["id"]), c_row["watchmode_id"])
            if c_row["legacy_tmdb_id"]:
                tmdb_to_content[int(c_row["legacy_tmdb_id"])] = (int(c_row["id"]), c_row["watchmode_id"])

        batch: list[tuple] = []
        for row in df.itertuples(index=False):
            ml_id = int(row.movieId)
            imdb_id = row.imdb_id if isinstance(row.imdb_id, str) and row.imdb_id else None
            legacy_tmdb = int(row.legacy_tmdb_id) if pd.notna(row.legacy_tmdb_id) else None
            rel_year = int(row.release_year) if pd.notna(row.release_year) else None

            canonical_id = None
            watchmode_id = None
            match_method = "movielens_links_csv"
            match_status = "imdb_linked" if imdb_id else "unmapped"

            if imdb_id and imdb_id in imdb_to_content:
                canonical_id, watchmode_id = imdb_to_content[imdb_id]
                match_method = "imdb_id_exact"
                match_status = "canonical_mapped"
                matched_canonical += 1
            elif legacy_tmdb and legacy_tmdb in tmdb_to_content:
                canonical_id, watchmode_id = tmdb_to_content[legacy_tmdb]
                match_method = "legacy_tmdb_bridge"
                match_status = "canonical_mapped"
                matched_canonical += 1

            batch.append(
                (
                    ml_id,
                    imdb_id,
                    legacy_tmdb,
                    watchmode_id,
                    canonical_id,
                    str(row.clean_title),
                    rel_year,
                    match_method,
                    match_status,
                    dataset.dataset_name,
                )
            )

        conn.executemany(
            """
            INSERT INTO id_mappings (
                movielens_movie_id, imdb_id, legacy_tmdb_id, watchmode_id,
                canonical_content_id, title, release_year,
                match_method, match_status, source_provenance, mapped_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(movielens_movie_id) DO UPDATE SET
                imdb_id = COALESCE(excluded.imdb_id, id_mappings.imdb_id),
                legacy_tmdb_id = COALESCE(excluded.legacy_tmdb_id, id_mappings.legacy_tmdb_id),
                watchmode_id = COALESCE(excluded.watchmode_id, id_mappings.watchmode_id),
                canonical_content_id = COALESCE(excluded.canonical_content_id, id_mappings.canonical_content_id),
                match_method = CASE
                    WHEN excluded.canonical_content_id IS NOT NULL THEN excluded.match_method
                    ELSE id_mappings.match_method
                END,
                match_status = CASE
                    WHEN excluded.canonical_content_id IS NOT NULL THEN excluded.match_status
                    ELSE id_mappings.match_status
                END,
                mapped_at = datetime('now')
            """,
            batch,
        )
        rows_upserted = len(batch)

    return {
        "mappings_upserted": rows_upserted,
        "canonical_matched": matched_canonical,
    }
