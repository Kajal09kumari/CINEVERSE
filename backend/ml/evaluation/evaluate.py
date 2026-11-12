"""
Offline evaluation suite for CINEVERSE's TruncatedSVD + Hybrid recommender.

Computes genuine holdout metrics over MovieLens ratings with strict train/test
separation and zero data leakage:
- RMSE & MAE (rating prediction accuracy)
- Precision@K, Recall@K, NDCG@K, Hit Rate@K (ranking quality)
- Catalog Coverage, Intra-List Genre Diversity, Novelty (beyond-accuracy)
- Cold-Start performance (evaluated separately on sparse/few-rating users)
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD


def _extract_genre_map(movies_df: pd.DataFrame | None) -> dict[int, frozenset[str]]:
    if movies_df is None or movies_df.empty:
        return {}
    genre_map: dict[int, frozenset[str]] = {}
    has_list = "genres_list" in movies_df.columns
    has_str = "genres" in movies_df.columns
    for row in movies_df.itertuples(index=False):
        mid = int(getattr(row, "movieId"))
        genres: list[str] = []
        if has_list:
            raw_list = getattr(row, "genres_list")
            if isinstance(raw_list, (list, tuple, set)):
                genres = [str(g).strip() for g in raw_list if str(g).strip()]
        if not genres and has_str:
            raw_str = str(getattr(row, "genres") or "")
            if raw_str and raw_str != "(no genres listed)":
                genres = [g.strip() for g in raw_str.split("|") if g.strip()]
        if genres:
            genre_map[mid] = frozenset(genres)
    return genre_map


def _ndcg_at_k(ranked_mids: list[int], relevant_mids: set[int], k: int) -> float:
    if not relevant_mids or not ranked_mids:
        return 0.0
    dcg = 0.0
    for rank_idx, mid in enumerate(ranked_mids[:k], start=1):
        if mid in relevant_mids:
            dcg += 1.0 / math.log2(rank_idx + 1)
    ideal_hits = min(len(relevant_mids), k)
    idcg = sum(1.0 / math.log2(idx + 1) for idx in range(1, ideal_hits + 1))
    return dcg / idcg if idcg > 0 else 0.0


def _intra_list_diversity(ranked_mids: list[int], genre_map: dict[int, frozenset[str]]) -> float | None:
    if not genre_map or len(ranked_mids) < 2:
        return None
    dists: list[float] = []
    for i in range(len(ranked_mids)):
        gi = genre_map.get(ranked_mids[i])
        if not gi:
            continue
        for j in range(i + 1, len(ranked_mids)):
            gj = genre_map.get(ranked_mids[j])
            if not gj:
                continue
            union = len(gi | gj)
            if union > 0:
                dists.append(1.0 - (len(gi & gj) / float(union)))
    return float(np.mean(dists)) if dists else None


def _fit_svd(
    train_df: pd.DataFrame,
    n_components: int,
    random_state: int,
) -> tuple[dict[int, int], dict[int, int], dict[int, float], float, np.ndarray, np.ndarray, int]:
    user_ids = np.sort(train_df["userId"].unique())
    movie_ids = np.sort(train_df["movieId"].unique())
    user_idx_map = {int(u): idx for idx, u in enumerate(user_ids)}
    movie_idx_map = {int(m): idx for idx, m in enumerate(movie_ids)}

    user_means = train_df.groupby("userId")["rating"].mean().to_dict()
    global_mean = float(train_df["rating"].mean())

    rows = train_df["userId"].map(user_idx_map).to_numpy()
    cols = train_df["movieId"].map(movie_idx_map).to_numpy()
    centered = (
        train_df["rating"].to_numpy(dtype=np.float32)
        - train_df["userId"].map(user_means).to_numpy(dtype=np.float32)
    )

    matrix = csr_matrix((centered, (rows, cols)), shape=(len(user_ids), len(movie_ids)))
    comps = max(2, min(n_components, min(matrix.shape) - 1))
    svd = TruncatedSVD(n_components=comps, random_state=random_state)
    user_factors = svd.fit_transform(matrix)
    item_factors = svd.components_.T
    return user_idx_map, movie_idx_map, user_means, global_mean, user_factors, item_factors, comps


def _evaluate_cold_start(
    ratings_df: pd.DataFrame,
    *,
    k: int,
    n_components: int,
    random_state: int,
) -> dict[str, Any]:
    """
    Evaluate cold-start performance on sparse users (<= 5 training interactions).
    When the dataset has >=20 ratings/user (e.g. MovieLens Small), deterministically
    downsamples 30 held-out users to 3 training ratings to measure genuine cold-start.
    """
    user_counts = ratings_df["userId"].value_counts()
    natural_sparse_users = set(user_counts[user_counts <= 5].index.astype(int).tolist())

    rng = np.random.default_rng(random_state + 99)
    if len(natural_sparse_users) >= 10:
        cold_users = sorted(natural_sparse_users)[:50]
        mode = "natural_sparse_users"
        train_parts = [ratings_df[~ratings_df["userId"].isin(cold_users)]]
        test_relevant: dict[int, set[int]] = {}
        for uid in cold_users:
            u_rows = ratings_df[ratings_df["userId"] == uid]
            if len(u_rows) < 2:
                continue
            train_parts.append(u_rows.iloc[: max(1, len(u_rows) // 2)])
            rel = set(u_rows.iloc[max(1, len(u_rows) // 2) :].loc[lambda d: d["rating"] >= 4.0, "movieId"].astype(int))
            if rel:
                test_relevant[uid] = rel
        cold_train_df = pd.concat(train_parts, ignore_index=True)
    else:
        eligible = sorted(int(u) for u, c in user_counts.items() if c >= 10)
        sample_size = min(40, len(eligible))
        if sample_size == 0:
            return {"mode": "unavailable", "evaluated_users": 0}
        cold_users = [int(u) for u in rng.choice(eligible, size=sample_size, replace=False)]
        mode = "simulated_3_rating_users"
        cold_set = set(cold_users)
        train_parts = [ratings_df[~ratings_df["userId"].isin(cold_set)]]
        test_relevant = {}
        for uid in cold_users:
            u_rows = ratings_df[ratings_df["userId"] == uid].sample(frac=1.0, random_state=random_state + uid)
            train_keep = u_rows.iloc[:3]
            holdout = u_rows.iloc[3:]
            rel = set(holdout[holdout["rating"] >= 4.0]["movieId"].astype(int))
            if rel:
                train_parts.append(train_keep)
                test_relevant[uid] = rel
        cold_train_df = pd.concat(train_parts, ignore_index=True)

    if not test_relevant or cold_train_df.empty:
        return {"mode": mode, "evaluated_users": 0}

    user_idx_map, movie_idx_map, _, _, user_factors, item_factors, _ = _fit_svd(
        cold_train_df, n_components=n_components, random_state=random_state
    )
    idx_to_movie = {idx: int(mid) for mid, idx in movie_idx_map.items()}
    train_seen = cold_train_df.groupby("userId")["movieId"].apply(set).to_dict()

    # Popularity baseline in cold-start training data (bayesian-weighted average)
    item_stats = cold_train_df.groupby("movieId")["rating"].agg(["count", "mean"])
    pop_scores_vec = np.zeros(len(movie_idx_map), dtype=np.float32)
    global_mean = float(cold_train_df["rating"].mean())
    for mid, row in item_stats.iterrows():
        if int(mid) in movie_idx_map:
            cnt = float(row["count"])
            avg = float(row["mean"])
            pop_scores_vec[movie_idx_map[int(mid)]] = ((cnt * avg) + (15.0 * global_mean)) / (cnt + 15.0)

    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []
    hits_any: list[float] = []

    for uid, rel_mids in test_relevant.items():
        if uid not in user_idx_map:
            continue
        u_idx = user_idx_map[uid]
        cf_scores = item_factors @ user_factors[u_idx]
        # Blend 35% CF + 65% popularity prior for 3-rating cold-start users
        scores = (0.35 * cf_scores) + (0.65 * (pop_scores_vec - global_mean))
        for mid in train_seen.get(uid, set()):
            if int(mid) in movie_idx_map:
                scores[movie_idx_map[int(mid)]] = -1e9
        eff_k = min(k, len(scores))
        top_indices = np.argpartition(scores, -eff_k)[-eff_k:]
        top_sorted = top_indices[np.argsort(scores[top_indices])[::-1]]
        ranked_mids = [idx_to_movie[int(i)] for i in top_sorted]
        hits = len(set(ranked_mids) & rel_mids)
        precisions.append(hits / float(k))
        recalls.append(hits / float(len(rel_mids)))
        ndcgs.append(_ndcg_at_k(ranked_mids, rel_mids, k))
        hits_any.append(1.0 if hits > 0 else 0.0)

    return {
        "mode": mode,
        "evaluated_users": len(precisions),
        f"precision_at_{k}": round(float(np.mean(precisions)) if precisions else 0.0, 4),
        f"recall_at_{k}": round(float(np.mean(recalls)) if recalls else 0.0, 4),
        f"ndcg_at_{k}": round(float(np.mean(ndcgs)) if ndcgs else 0.0, 4),
        f"hit_rate_at_{k}": round(float(np.mean(hits_any)) if hits_any else 0.0, 4),
    }


def evaluate_svd_holdout(
    ratings_df: pd.DataFrame,
    *,
    n_components: int = 48,
    k: int = 10,
    test_ratio: float = 0.2,
    random_state: int = 42,
    movies_df: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """Run leak-free holdout evaluation of TruncatedSVD collaborative filtering."""
    if ratings_df.empty:
        return {
            "rmse": 0.0,
            "mae": 0.0,
            f"precision_at_{k}": 0.0,
            f"recall_at_{k}": 0.0,
            f"ndcg_at_{k}": 0.0,
            f"hit_rate_at_{k}": 0.0,
            "catalog_coverage": 0.0,
            "diversity": None,
            "novelty": 0.0,
            "test_samples": 0,
            "evaluated_users": 0,
        }

    shuffled = ratings_df.sample(frac=1.0, random_state=random_state).reset_index(drop=True)
    split_idx = int(len(shuffled) * (1.0 - test_ratio))
    train_df = shuffled.iloc[:split_idx]
    test_df = shuffled.iloc[split_idx:]

    user_idx_map, movie_idx_map, user_means, global_mean, user_factors, item_factors, comps = _fit_svd(
        train_df, n_components=n_components, random_state=random_state
    )

    sq_errors: list[float] = []
    abs_errors: list[float] = []
    relevant_by_user: dict[int, set[int]] = {}
    for row in test_df.itertuples(index=False):
        uid = int(row.userId)
        mid = int(row.movieId)
        rating = float(row.rating)
        if uid in user_idx_map and mid in movie_idx_map:
            u_idx = user_idx_map[uid]
            m_idx = movie_idx_map[mid]
            pred = float(user_means.get(uid, global_mean)) + float(
                np.dot(user_factors[u_idx], item_factors[m_idx])
            )
            pred = float(np.clip(pred, 0.5, 5.0))
            err = pred - rating
            sq_errors.append(err * err)
            abs_errors.append(abs(err))
            if rating >= 4.0:
                relevant_by_user.setdefault(uid, set()).add(mid)

    rmse = float(np.sqrt(np.mean(sq_errors))) if sq_errors else 0.0
    mae = float(np.mean(abs_errors)) if abs_errors else 0.0

    train_seen = train_df.groupby("userId")["movieId"].apply(set).to_dict()
    eval_users = [u for u, rel in relevant_by_user.items() if rel][:100]

    # Training-set item popularity probabilities for novelty calculation
    total_train_interactions = max(1, len(train_df))
    item_pop_counts = train_df["movieId"].value_counts().to_dict()
    genre_map = _extract_genre_map(movies_df)

    precisions: list[float] = []
    recalls: list[float] = []
    ndcgs: list[float] = []
    hits_any: list[float] = []
    diversities: list[float] = []
    novelties: list[float] = []
    recommended_catalog: set[int] = set()

    if eval_users:
        idx_to_movie = {idx: int(mid) for mid, idx in movie_idx_map.items()}
        for uid in eval_users:
            u_idx = user_idx_map[uid]
            scores = (item_factors @ user_factors[u_idx]).copy()
            seen = train_seen.get(uid, set())
            for mid in seen:
                if mid in movie_idx_map:
                    scores[movie_idx_map[mid]] = -1e9
            eff_k = min(k, len(scores))
            top_indices = np.argpartition(scores, -eff_k)[-eff_k:]
            top_sorted = top_indices[np.argsort(scores[top_indices])[::-1]]
            ranked_mids = [idx_to_movie[int(i)] for i in top_sorted]
            recommended_catalog.update(ranked_mids)

            rel_mids = relevant_by_user[uid]
            hits = len(set(ranked_mids) & rel_mids)
            precisions.append(hits / float(k))
            recalls.append(hits / float(len(rel_mids)))
            ndcgs.append(_ndcg_at_k(ranked_mids, rel_mids, k))
            hits_any.append(1.0 if hits > 0 else 0.0)

            div = _intra_list_diversity(ranked_mids, genre_map)
            if div is not None:
                diversities.append(div)

            item_nov = [
                -math.log2(max(1, int(item_pop_counts.get(mid, 1))) / float(total_train_interactions))
                for mid in ranked_mids
            ]
            novelties.append(float(np.mean(item_nov)))

    catalog_coverage = (
        len(recommended_catalog) / float(len(movie_idx_map))
        if movie_idx_map
        else 0.0
    )
    cold_start = _evaluate_cold_start(
        ratings_df, k=k, n_components=n_components, random_state=random_state
    )

    return {
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        f"precision_at_{k}": round(float(np.mean(precisions)) if precisions else 0.0, 4),
        f"recall_at_{k}": round(float(np.mean(recalls)) if recalls else 0.0, 4),
        f"ndcg_at_{k}": round(float(np.mean(ndcgs)) if ndcgs else 0.0, 4),
        f"hit_rate_at_{k}": round(float(np.mean(hits_any)) if hits_any else 0.0, 4),
        "catalog_coverage": round(catalog_coverage, 4),
        "diversity": round(float(np.mean(diversities)), 4) if diversities else None,
        "novelty": round(float(np.mean(novelties)) if novelties else 0.0, 4),
        "test_samples": len(sq_errors),
        "evaluated_users": len(eval_users),
        "latent_factors": comps,
        "cold_start": cold_start,
    }


if __name__ == "__main__":
    import json
    from pathlib import Path
    from ml.preprocessing.movielens_loader import load_movielens_dataset

    raw_dir = Path(__file__).resolve().parents[1] / "data" / "raw"
    dataset = load_movielens_dataset(raw_dir)
    metrics = evaluate_svd_holdout(dataset.ratings_df, movies_df=dataset.movies_df)
    print(json.dumps(metrics, indent=2))
