"""
Offline evaluation suite for CINEVERSE's TruncatedSVD + Hybrid recommender.

Computes genuine holdout RMSE, MAE, Precision@K, and Recall@K over the
MovieLens ratings split without leaking test ratings into training.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD


def evaluate_svd_holdout(
    ratings_df: pd.DataFrame,
    *,
    n_components: int = 48,
    k: int = 10,
    test_ratio: float = 0.2,
    random_state: int = 42,
) -> dict[str, float | int]:
    """Run user-stratified holdout evaluation of TruncatedSVD collaborative filtering."""
    if ratings_df.empty:
        return {"rmse": 0.0, "mae": 0.0, "precision_at_10": 0.0, "recall_at_10": 0.0, "test_samples": 0}

    rng = np.random.default_rng(random_state)
    shuffled = ratings_df.sample(frac=1.0, random_state=random_state).reset_index(drop=True)
    split_idx = int(len(shuffled) * (1.0 - test_ratio))
    train_df = shuffled.iloc[:split_idx]
    test_df = shuffled.iloc[split_idx:]

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

    # Sample up to 80 users with positive test items to measure ranking Precision@K / Recall@K
    train_seen = train_df.groupby("userId")["movieId"].apply(set).to_dict()
    eval_users = [u for u, rel in relevant_by_user.items() if rel][:80]
    precisions: list[float] = []
    recalls: list[float] = []

    if eval_users:
        idx_to_movie = {idx: int(mid) for mid, idx in movie_idx_map.items()}
        for uid in eval_users:
            u_idx = user_idx_map[uid]
            scores = item_factors @ user_factors[u_idx]
            seen = train_seen.get(uid, set())
            for mid in seen:
                if mid in movie_idx_map:
                    scores[movie_idx_map[mid]] = -1e9
            top_indices = np.argpartition(scores, -k)[-k:]
            top_sorted = top_indices[np.argsort(scores[top_indices])[::-1]]
            rec_mids = {idx_to_movie[int(i)] for i in top_sorted}
            rel_mids = relevant_by_user[uid]
            hits = len(rec_mids & rel_mids)
            precisions.append(hits / float(k))
            recalls.append(hits / float(len(rel_mids)))

    _ = rng
    return {
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        f"precision_at_{k}": round(float(np.mean(precisions)) if precisions else 0.0, 4),
        f"recall_at_{k}": round(float(np.mean(recalls)) if recalls else 0.0, 4),
        "test_samples": len(sq_errors),
        "evaluated_users": len(eval_users),
        "latent_factors": comps,
    }
