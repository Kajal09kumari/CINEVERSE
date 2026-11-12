"""
CINEVERSE Hybrid ML Recommendation Engine

Combines:
1. Content-Based Filtering: TF-IDF over MovieLens titles, cleaned genres, and community tags.
2. Collaborative Filtering: TruncatedSVD latent user-item matrix factorization over MovieLens ratings.
3. User Preference & Feedback Intelligence: Live user ratings, watchlist, explicit preferences,
   and dampened conversational feedback (like, dislike, not_interested, already_watched, more_like_this).
4. Explainability: Deterministic per-item reason attribution strictly grounded in observed signals.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core.config import BACKEND_DIR
from ml.evaluation.evaluate import evaluate_svd_holdout
from ml.preprocessing.movielens_loader import (
    MovieLensDataset,
    load_movielens_dataset,
    sync_movielens_links_to_db,
)

logger = logging.getLogger(__name__)

ARTIFACT_DIR = BACKEND_DIR / "ml" / "models" / "artifacts"
MODEL_ARTIFACT_PATH = ARTIFACT_DIR / "hybrid_movielens_v1.joblib"


@dataclass
class RecommendationQuery:
    """Structured recommendation request combining hard constraints and user taste."""

    seed_movielens_ids: list[int] = field(default_factory=list)
    seed_titles: list[str] = field(default_factory=list)
    text_query: str = ""
    genres: list[str] = field(default_factory=list)
    exclude_genres: list[str] = field(default_factory=list)
    content_type: str | None = None  # MOVIE | DOCUMENTARY | None
    min_rating_10: float | None = None
    year_min: int | None = None
    year_max: int | None = None
    underrated: bool = False
    surprise_different: bool = False
    top_k: int = 10

    # Live user profile signals
    preferred_genres: list[str] = field(default_factory=list)
    disliked_genres: list[str] = field(default_factory=list)
    rated_items_ml: dict[int, float] = field(default_factory=dict)  # ml_id -> rating (0..10)
    watchlist_ml_ids: set[int] = field(default_factory=set)
    liked_ml_ids: set[int] = field(default_factory=set)
    disliked_ml_ids: set[int] = field(default_factory=set)
    excluded_ml_ids: set[int] = field(default_factory=set)


class HybridRecommender:
    """Trained TF-IDF + TruncatedSVD hybrid recommender backed by MovieLens."""

    def __init__(self) -> None:
        self.ready: bool = False
        self.trained_at: str = ""
        self.dataset_stats: dict[str, Any] = {}
        self.eval_metrics: dict[str, Any] = {}

        self.movies_df: pd.DataFrame = pd.DataFrame()
        self.movielens_id_to_pos: dict[int, int] = {}
        self.imdb_to_pos: dict[str, int] = {}
        self.title_to_pos: dict[str, list[int]] = {}

        self.tfidf: TfidfVectorizer | None = None
        self.tfidf_matrix: Any = None
        self.item_factors_norm: np.ndarray = np.empty((0, 0), dtype=np.float32)
        self.quality_scores: np.ndarray = np.empty((0,), dtype=np.float32)

    @classmethod
    def load_or_train(
        cls,
        *,
        force_retrain: bool = False,
        base_dir: Path | None = None,
        sync_db: bool = True,
    ) -> "HybridRecommender":
        """Load persisted joblib artifact if available; otherwise train from MovieLens."""
        instance = cls()
        if not force_retrain and MODEL_ARTIFACT_PATH.exists():
            try:
                payload = joblib.load(MODEL_ARTIFACT_PATH)
                instance._restore_payload(payload)
                logger.info(
                    "Loaded MovieLens HybridRecommender artifact (%d titles).",
                    len(instance.movies_df),
                )
                return instance
            except Exception as exc:
                logger.warning("Failed loading saved ML artifact, retraining: %s", exc)

        dataset = load_movielens_dataset(base_dir=base_dir, auto_download=True)
        instance.fit(dataset)
        if sync_db:
            try:
                sync_movielens_links_to_db(dataset)
            except Exception as exc:
                logger.warning("Non-fatal SQLite id_mappings sync error: %s", exc)
        instance.save()
        return instance

    def fit(self, dataset: MovieLensDataset) -> None:
        """Fit TF-IDF content matrix and TruncatedSVD collaborative item factors."""
        movies = dataset.movies_df.reset_index(drop=True).copy()
        ratings = dataset.ratings_df

        self.movies_df = movies
        self.dataset_stats = dict(dataset.stats)
        self.trained_at = datetime.now(timezone.utc).isoformat()

        self.movielens_id_to_pos = {
            int(mid): pos for pos, mid in enumerate(movies["movieId"].tolist())
        }
        self.imdb_to_pos = {}
        self.title_to_pos = {}
        for pos, row in enumerate(movies.itertuples(index=False)):
            imdb = getattr(row, "imdb_id", None)
            if isinstance(imdb, str) and imdb:
                self.imdb_to_pos[imdb] = pos
            clean_key = str(row.clean_title or "").strip().lower()
            if clean_key:
                self.title_to_pos.setdefault(clean_key, []).append(pos)

        # 1. Content-Based TF-IDF
        self.tfidf = TfidfVectorizer(
            ngram_range=(1, 2),
            max_features=12000,
            stop_words="english",
            sublinear_tf=True,
        )
        self.tfidf_matrix = self.tfidf.fit_transform(movies["soup"].fillna(""))

        # 2. Collaborative Filtering (TruncatedSVD over user-centered ratings)
        n_items = len(movies)
        item_factors = np.zeros((n_items, 48), dtype=np.float32)

        if not ratings.empty:
            user_ids = np.sort(ratings["userId"].unique())
            uid_map = {int(u): i for i, u in enumerate(user_ids)}
            user_means = ratings.groupby("userId")["rating"].mean().to_dict()

            valid_mask = ratings["movieId"].isin(self.movielens_id_to_pos)
            valid_ratings = ratings[valid_mask]

            row_idx = valid_ratings["userId"].map(uid_map).to_numpy()
            col_idx = valid_ratings["movieId"].map(self.movielens_id_to_pos).to_numpy()
            centered_vals = (
                valid_ratings["rating"].to_numpy(dtype=np.float32)
                - valid_ratings["userId"].map(user_means).to_numpy(dtype=np.float32)
            )

            mat = csr_matrix(
                (centered_vals, (row_idx, col_idx)),
                shape=(len(user_ids), n_items),
            )
            comps = max(2, min(48, min(mat.shape) - 1))
            svd = TruncatedSVD(n_components=comps, random_state=42)
            svd.fit(mat)
            item_factors = svd.components_.T.astype(np.float32)

        norms = np.linalg.norm(item_factors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.item_factors_norm = item_factors / norms

        # Quality anchor normalized to [0, 1]
        wr = movies["weighted_rating_10"].to_numpy(dtype=np.float32)
        min_w, max_w = float(wr.min()) if len(wr) else 0.0, float(wr.max()) if len(wr) else 10.0
        denom = (max_w - min_w) if max_w > min_w else 1.0
        self.quality_scores = (wr - min_w) / denom

        # Offline evaluation metrics
        self.eval_metrics = evaluate_svd_holdout(ratings, n_components=48, k=10)
        self.ready = True

    def save(self, path: Path | None = None) -> Path:
        target = path or MODEL_ARTIFACT_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "trained_at": self.trained_at,
            "dataset_stats": self.dataset_stats,
            "eval_metrics": self.eval_metrics,
            "movies_df": self.movies_df,
            "movielens_id_to_pos": self.movielens_id_to_pos,
            "imdb_to_pos": self.imdb_to_pos,
            "title_to_pos": self.title_to_pos,
            "tfidf": self.tfidf,
            "tfidf_matrix": self.tfidf_matrix,
            "item_factors_norm": self.item_factors_norm,
            "quality_scores": self.quality_scores,
        }
        joblib.dump(payload, target, compress=3)
        return target

    def _restore_payload(self, payload: dict[str, Any]) -> None:
        self.trained_at = payload["trained_at"]
        self.dataset_stats = payload["dataset_stats"]
        self.eval_metrics = payload["eval_metrics"]
        self.movies_df = payload["movies_df"]
        self.movielens_id_to_pos = payload["movielens_id_to_pos"]
        self.imdb_to_pos = payload["imdb_to_pos"]
        self.title_to_pos = payload["title_to_pos"]
        self.tfidf = payload["tfidf"]
        self.tfidf_matrix = payload["tfidf_matrix"]
        self.item_factors_norm = payload["item_factors_norm"]
        self.quality_scores = payload["quality_scores"]
        self.ready = True

    def find_position_by_title(self, title: str) -> int | None:
        """Resolve a human title string to best matching MovieLens index position."""
        if not title or self.movies_df.empty:
            return None
        key = title.strip().lower()
        if key in self.title_to_pos:
            positions = self.title_to_pos[key]
            # Pick most rated movie among exact title homonyms
            return max(positions, key=lambda p: int(self.movies_df.iloc[p]["rating_count"]))

        # Substring fallback ranked by rating_count
        mask = self.movies_df["clean_title"].str.lower().str.contains(key, regex=False, na=False)
        candidates = self.movies_df[mask]
        if candidates.empty:
            return None
        best_idx = int(candidates["rating_count"].idxmax())
        return best_idx

    def resolve_movielens_id(
        self,
        *,
        movielens_id: int | None = None,
        imdb_id: str | None = None,
        title: str | None = None,
    ) -> int | None:
        if movielens_id and movielens_id in self.movielens_id_to_pos:
            return movielens_id
        if imdb_id and imdb_id in self.imdb_to_pos:
            pos = self.imdb_to_pos[imdb_id]
            return int(self.movies_df.iloc[pos]["movieId"])
        if title:
            pos = self.find_position_by_title(title)
            if pos is not None:
                return int(self.movies_df.iloc[pos]["movieId"])
        return None

    def recommend(self, query: RecommendationQuery) -> list[dict[str, Any]]:
        """
        Compute ranked hybrid recommendations with strict constraint filtering and
        per-item explainability grounded in TF-IDF, SVD, user ratings, and preferences.
        """
        if not self.ready or self.movies_df.empty:
            return []

        n = len(self.movies_df)

        # Resolve seed positions (explicit seeds + positive user history)
        seed_positions: list[int] = []
        seed_titles_resolved: list[str] = []
        for mid in query.seed_movielens_ids:
            if mid in self.movielens_id_to_pos:
                pos = self.movielens_id_to_pos[mid]
                seed_positions.append(pos)
                seed_titles_resolved.append(str(self.movies_df.iloc[pos]["clean_title"]))

        for title_str in query.seed_titles:
            pos = self.find_position_by_title(title_str)
            if pos is not None and pos not in seed_positions:
                seed_positions.append(pos)
                seed_titles_resolved.append(str(self.movies_df.iloc[pos]["clean_title"]))

        # History positions (ratings >= 7.0, watchlist, liked feedback) for personalized profile
        history_weights: dict[int, float] = {}
        for mid, rating10 in query.rated_items_ml.items():
            if mid in self.movielens_id_to_pos:
                pos = self.movielens_id_to_pos[mid]
                # Center around 6.0 so low ratings (< 6) push away, high ratings pull closer
                history_weights[pos] = (rating10 - 6.0) / 4.0
        for mid in query.watchlist_ml_ids:
            if mid in self.movielens_id_to_pos:
                pos = self.movielens_id_to_pos[mid]
                history_weights.setdefault(pos, 0.55)
        for mid in query.liked_ml_ids:
            if mid in self.movielens_id_to_pos:
                pos = self.movielens_id_to_pos[mid]
                history_weights[pos] = max(history_weights.get(pos, 0.0), 0.75)

        # Dampened penalty weights from disliked history (<1x distortion guard)
        neg_positions: list[int] = [
            self.movielens_id_to_pos[mid]
            for mid in query.disliked_ml_ids
            if mid in self.movielens_id_to_pos
        ]

        # ── Signal 1: Content-Based TF-IDF Similarity ───────────────────────
        cb_scores = np.zeros(n, dtype=np.float32)
        if seed_positions:
            seed_vecs = self.tfidf_matrix[seed_positions]
            mean_seed_vec = np.asarray(seed_vecs.mean(axis=0))
            cb_scores = cosine_similarity(self.tfidf_matrix, mean_seed_vec).ravel().astype(np.float32)
        elif (query.text_query or "").strip() and self.tfidf is not None:
            q_vec = self.tfidf.transform([(query.text_query or "").strip()])
            cb_scores = cosine_similarity(self.tfidf_matrix, q_vec).ravel().astype(np.float32)
        elif history_weights and not query.surprise_different:
            pos_items = [(p, w) for p, w in history_weights.items() if w > 0]
            if pos_items:
                idxs = [p for p, _ in pos_items]
                wts = np.array([w for _, w in pos_items], dtype=np.float32)[:, None]
                prof_vec = np.asarray((self.tfidf_matrix[idxs].multiply(wts)).mean(axis=0))
                cb_scores = cosine_similarity(self.tfidf_matrix, prof_vec).ravel().astype(np.float32)

        # ── Signal 2: Collaborative SVD Latent Similarity ───────────────────
        cf_scores = np.zeros(n, dtype=np.float32)
        if seed_positions:
            target_factor = self.item_factors_norm[seed_positions].mean(axis=0)
            norm = float(np.linalg.norm(target_factor))
            if norm > 0:
                cf_scores = (self.item_factors_norm @ (target_factor / norm)).astype(np.float32)
        elif history_weights and not query.surprise_different:
            weighted_factor = np.zeros(self.item_factors_norm.shape[1], dtype=np.float32)
            for p, w in history_weights.items():
                weighted_factor += float(w) * self.item_factors_norm[p]
            norm = float(np.linalg.norm(weighted_factor))
            if norm > 0:
                cf_scores = (self.item_factors_norm @ (weighted_factor / norm)).astype(np.float32)

        cf_norm = np.clip((cf_scores + 1.0) / 2.0, 0.0, 1.0)

        # Gentle negative dampening away from disliked items
        neg_penalty = np.zeros(n, dtype=np.float32)
        if neg_positions:
            neg_factor = self.item_factors_norm[neg_positions].mean(axis=0)
            neg_norm = float(np.linalg.norm(neg_factor))
            if neg_norm > 0:
                neg_sim = np.clip(self.item_factors_norm @ (neg_factor / neg_norm), 0.0, 1.0)
                neg_penalty = 0.18 * neg_sim.astype(np.float32)

        # ── Signal 3: Genre & Preference Alignment ──────────────────────────
        requested_genres_lc = {g.lower() for g in query.genres}
        exclude_genres_lc = {g.lower() for g in query.exclude_genres}
        pref_genres_lc = {g.lower() for g in query.preferred_genres}
        disliked_genres_lc = {g.lower() for g in query.disliked_genres}

        genres_col = self.movies_df["genres_clean"].tolist()
        genre_boost = np.zeros(n, dtype=np.float32)
        hard_mask = np.ones(n, dtype=bool)

        # Exclude seeds, explicit excludes, and seen/disliked items
        excluded_positions = set(seed_positions) | {
            self.movielens_id_to_pos[mid]
            for mid in (set(query.excluded_ml_ids) | set(query.disliked_ml_ids))
            if mid in self.movielens_id_to_pos
        }
        for p in excluded_positions:
            hard_mask[p] = False

        if query.content_type == "DOCUMENTARY":
            hard_mask &= self.movies_df["is_documentary"].to_numpy(dtype=bool)
        elif query.content_type == "MOVIE":
            pass

        if query.min_rating_10 is not None:
            hard_mask &= self.movies_df["weighted_rating_10"].to_numpy(dtype=np.float32) >= float(
                query.min_rating_10
            )

        years = self.movies_df["release_year"].fillna(0).to_numpy(dtype=np.int32)
        if query.year_min is not None:
            hard_mask &= years >= int(query.year_min)
        if query.year_max is not None:
            hard_mask &= (years > 0) & (years <= int(query.year_max))

        counts = self.movies_df["rating_count"].to_numpy(dtype=np.int32)
        if query.underrated:
            # Acclaimed titles outside mega-blockbuster volume (between 10 and 90 votes in ml-latest-small)
            hard_mask &= (counts >= 8) & (counts <= 90)
            hard_mask &= self.movies_df["weighted_rating_10"].to_numpy(dtype=np.float32) >= 7.2
        else:
            # Cold-start / unseeded reliability: require at least 5 community ratings unless filtered tightly
            if not seed_positions and not (query.text_query or "").strip():
                hard_mask &= counts >= 5

        for idx, g_list in enumerate(genres_col):
            if not hard_mask[idx]:
                continue
            g_lc = {g.lower() for g in g_list}
            if exclude_genres_lc and (g_lc & exclude_genres_lc):
                hard_mask[idx] = False
                continue
            if requested_genres_lc:
                overlap = len(g_lc & requested_genres_lc)
                if overlap == 0:
                    hard_mask[idx] = False
                    continue
                genre_boost[idx] += 0.28 * (overlap / len(requested_genres_lc))
            if pref_genres_lc:
                if query.surprise_different:
                    # "Give me something different from my usual preferences"
                    if g_lc & pref_genres_lc:
                        genre_boost[idx] -= 0.25
                    else:
                        genre_boost[idx] += 0.22
                else:
                    pref_overlap = len(g_lc & pref_genres_lc)
                    if pref_overlap:
                        genre_boost[idx] += 0.14 * min(1.0, pref_overlap / max(1, len(pref_genres_lc)))
            if disliked_genres_lc and (g_lc & disliked_genres_lc):
                genre_boost[idx] -= 0.18

        # Weighted hybrid combination
        has_seed = bool(seed_positions)
        has_history = bool(history_weights) and not query.surprise_different
        has_text = bool((query.text_query or "").strip())

        if has_seed:
            w_cb, w_cf, w_q = 0.44, 0.40, 0.16
        elif has_history and has_text:
            w_cb, w_cf, w_q = 0.42, 0.36, 0.22
        elif has_history:
            w_cb, w_cf, w_q = 0.30, 0.45, 0.25
        elif has_text:
            w_cb, w_cf, w_q = 0.55, 0.10, 0.35
        else:
            # Cold start or pure filter query: lean on quality + genre match + popularity confidence
            w_cb, w_cf, w_q = 0.10, 0.10, 0.80

        total_scores = (
            w_cb * cb_scores
            + w_cf * cf_norm
            + w_q * self.quality_scores
            + genre_boost
            - neg_penalty
        )
        total_scores[~hard_mask] = -1e9

        valid_indices = np.where(hard_mask)[0]
        if len(valid_indices) == 0:
            return []

        top_n = min(query.top_k, len(valid_indices))
        top_pos = valid_indices[np.argpartition(total_scores[valid_indices], -top_n)[-top_n:]]
        top_sorted = top_pos[np.argsort(total_scores[top_pos])[::-1]]

        results: list[dict[str, Any]] = []
        for pos in top_sorted:
            row = self.movies_df.iloc[int(pos)]
            g_list = list(row["genres_clean"])
            explanation = self._build_explanation(
                query=query,
                row=row,
                genres=g_list,
                seed_titles=seed_titles_resolved,
                cb_score=float(cb_scores[pos]),
                cf_score=float(cf_norm[pos]),
            )
            results.append(
                {
                    "movielens_id": int(row["movieId"]),
                    "imdb_id": row["imdb_id"] if isinstance(row["imdb_id"], str) else None,
                    "legacy_tmdb_id": (
                        int(row["legacy_tmdb_id"]) if pd.notna(row["legacy_tmdb_id"]) else None
                    ),
                    "title": str(row["clean_title"]),
                    "release_year": (
                        int(row["release_year"]) if pd.notna(row["release_year"]) else None
                    ),
                    "genres": g_list,
                    "content_type": str(row["content_type"]),
                    "is_documentary": bool(row["is_documentary"]),
                    "rating": float(row["weighted_rating_10"]),
                    "rating_count": int(row["rating_count"]),
                    "community_tags": str(row["community_tags"] or ""),
                    "hybrid_score": round(float(total_scores[pos]), 4),
                    "signals": {
                        "content_similarity": round(float(cb_scores[pos]), 4),
                        "collaborative_svd": round(float(cf_norm[pos]), 4),
                        "quality_score": round(float(self.quality_scores[pos]), 4),
                    },
                    "explanation": explanation,
                }
            )
        return results

    @staticmethod
    def _build_explanation(
        *,
        query: RecommendationQuery,
        row: pd.Series,
        genres: list[str],
        seed_titles: list[str],
        cb_score: float,
        cf_score: float,
    ) -> str:
        """Produce a strictly factual, non-fabricated explanation for why this item was selected."""
        reasons: list[str] = []
        g_lc = {g.lower(): g for g in genres}

        if seed_titles:
            reasons.append(
                f"Matched themes and viewer overlap with {seed_titles[0]}"
                if cf_score >= 0.55 and cb_score >= 0.15
                else f"Shares genre and thematic DNA with {seed_titles[0]}"
            )

        matched_req = [g_lc[g.lower()] for g in query.genres if g.lower() in g_lc]
        if matched_req:
            reasons.append(f"Matches your requested {', '.join(matched_req[:2])} filter")
        elif query.preferred_genres and not query.surprise_different:
            matched_pref = [g_lc[g.lower()] for g in query.preferred_genres if g.lower() in g_lc]
            if matched_pref:
                reasons.append(f"Aligns with your saved preference for {', '.join(matched_pref[:2])}")
        elif query.surprise_different:
            reasons.append("Selected to broaden beyond your usual genres")

        if not seed_titles and (query.rated_items_ml or query.watchlist_ml_ids or query.liked_ml_ids):
            if cf_score >= 0.62:
                reasons.append("Strong collaborative SVD match with your ratings and watchlist")

        if query.underrated:
            reasons.append(
                f"Underrated pick rated {float(row['weighted_rating_10']):.1f}/10 across {int(row['rating_count'])} MovieLens reviews"
            )
        elif not reasons:
            reasons.append(
                f"Acclaimed MovieLens pick rated {float(row['weighted_rating_10']):.1f}/10 ({int(row['rating_count'])} reviews)"
            )

        return ". ".join(reasons[:2]) + "."
