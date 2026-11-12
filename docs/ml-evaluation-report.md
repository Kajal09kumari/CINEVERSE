# CINEVERSE Recommendation Engine — Offline ML Evaluation Report

**Evaluation Script:** [`evaluate.py`](file:///c:/Users/Kajal%20kumari/OneDrive/Desktop/CINEVERSE/backend/ml/evaluation/evaluate.py)  
**Model:** `TruncatedSVD` Collaborative Filtering (mean-centered user-item matrix, 48 latent factors) + Bayesian Popularity Cold-Start Prior  
**Dataset:** MovieLens (`ml-latest-small`, 100,836 ratings, 9,742 movies)

---

## 1. Evaluation Methodology & Zero-Leakage Guarantees

1. **Strict Train/Test Separation (`test_ratio = 0.2`, `random_state = 42`):**
   - Ratings are deterministically shuffled and split 80% / 20% before any user means, global mean, item popularity priors, or SVD factors are computed.
   - Only `train_df` is used to fit `TruncatedSVD`, compute user/global rating means, compute training-set item popularity probabilities (for novelty), and mask already-seen items during top-K ranking.
   - `test_df` items with `rating >= 4.0` define the ground-truth relevant set per user.
2. **Cold-Start Isolation (`_evaluate_cold_start`):**
   - Because `ml-latest-small` enforces a minimum of 20 ratings per user, natural `<= 5`-rating users are unavailable (`0` users).
   - To measure cold-start genuinely without leakage, 40 eligible users are deterministically downsampled to **3 training ratings** while holding out their remaining ratings for ground-truth testing, and scored with a `35% CF + 65% Bayesian popularity` blend.

---

## 2. Observed Holdout Metrics (`k = 10`)

| Metric | Warm-User Holdout (`100` users, `19,301` test pairs) | Cold-Start (`40` simulated 3-rating users) |
| :--- | :---: | :---: |
| **RMSE** | `0.924` | — |
| **MAE** | `0.7142` | — |
| **Precision@10** | `0.198` | `0.27` |
| **Recall@10** | `0.0954` | `0.044` |
| **NDCG@10** | `0.2426` | `0.2916` |
| **Hit Rate@10** | `0.8` (80.0%) | `0.725` (72.5%) |
| **Catalog Coverage** | `0.0347` (3.47%) | — |
| **Intra-List Genre Diversity** | `0.809` | — |
| **Novelty (mean $-\log_2 p$)** | `9.6784` | — |

---

## 3. Analysis, Weaknesses & Next Improvements

### Strengths
- **Strong Top-10 Hit Rate (`80.0%`) & Intra-List Diversity (`0.809`):** 4 out of 5 evaluated warm users receive at least one held-out `>= 4.0` film in their top-10, while recommendations span diverse genres rather than repeating a single genre cluster.
- **Cold-Start Resilience (`72.5%` Hit Rate@10):** Blending `35%` sparse CF with `65%` Bayesian popularity prevents erratic low-support SVD predictions when users have only 3 ratings.

### Honest Weaknesses Observed
1. **Low Catalog Coverage (`3.47%`):** Across 100 evaluated users, SVD concentrates recommendations on a narrow slice of the 9,742-title catalog. In production CINEVERSE, this is mitigated by `HybridRecommender` blending TF-IDF content similarity, Taste DNA genre/theme boosts, and Watchmode trending/discover candidates, plus the `discovery_openness` exploration slider.
2. **Cold-Start Recall (`0.044`):** With only 3 training ratings, users with many held-out favorites (`>= 10`) have low recall in top-10 even though `Precision@10` (`0.27`) is high. Onboarding Taste DNA preferences (genres, themes, era, disliked genres) directly addresses this in live serving.
3. **Evaluation Scope:** `evaluate_svd_holdout` benchmarks the collaborative TruncatedSVD + popularity core on historical MovieLens ratings; live Watchmode availability, user feedback (`like`/`dislike`/`not_interested`), and MIRA conversational constraints are evaluated via integration tests and live product analytics (`CTR` and `like_ratio_pct`).
