# CINEVERSE — Phase 0 Repository Audit & Migration Plan (TMDB -> Watchmode + MovieLens)

**Audit Date:** 2026-11-12  
**Baseline Commit:** `30fd1f9` (`Project foundation`) + uncommitted Day 2 / Day 3 / Day 3.1 workspace state (pre-migration backup diff saved to session scratch: `pre_watchmode_migration.patch`)

---

## 1. Existing Architecture

| Layer | Technology & Entry Points | Current Status |
|---|---|---|
| **Frontend** | Next.js `16.4.6` (Turbopack, `cacheComponents: true`), React `19.3.0`, TypeScript `^5`, Tailwind CSS `4.3.3`, Framer Motion `^14.11.1`, Lucide React `^1.71.0` | **Working UI shell & discovery pages** (`/`, `/discover`, `/movie/[id]`, `/watchlist`, `/collections`, `/assistant`, `/profile`, `/about`, `/privacy`) |
| **Backend** | Python `3.15.2` (`.venv` at `backend/venv/`), FastAPI `0.115.6`, Uvicorn `0.32.1`, HTTPX `0.28.1`, Pydantic Settings `2.7.0`, Pandas `2.2.3`, NumPy `2.2.0`, Scikit-learn `1.6.0`, SciPy `1.15.0`, Joblib `1.4.2`, Pytest `8.3.4` | **Running on `127.0.0.1:8000`** with `/health`, `/docs`, `/api/movies/*` (TMDB-backed) |
| **Database** | Planned Supabase/PostgreSQL in `docs/database-schema.md`; **no live DB or ORM configured yet** (`SUPABASE_URL` / `SUPABASE_KEY` empty) | Needs lightweight local SQLite store (`sqlite:///./data/cineverse.db`) with Supabase-compatible schema |
| **ML Pipeline** | `backend/ml/__init__.py` exists; preprocessing/models/evaluation modules not yet implemented | Ready for MovieLens 32M + local small dataset ingestion, TF-IDF content filtering, SVD collaborative filtering, and hybrid ranking |

---

## 2. TMDB Dependencies Identified

### Backend TMDB References
- `backend/.env` & `backend/.env.example`: `TMDB_ACCESS_TOKEN`
- `backend/app/core/config.py`: `tmdb_access_token`, `tmdb_base_url`, `has_tmdb_token`
- `backend/app/main.py`: imports and initializes `TMDBService` in lifespan state
- `backend/app/services/tmdb_service.py`: all live HTTPX requests to `https://api.themoviedb.org/3`
- `backend/app/api/routes/movies.py`: `/api/movies/*` routes delegating to `TMDBService`
- `backend/app/schemas/movie.py`: TMDB-shaped models (`poster_path`, `backdrop_path`, `vote_average`, `vote_count`, `source="tmdb"`)
- `backend/tests/test_movies.py`: mocked TMDB API tests

### Frontend TMDB References
- `frontend/.env.local.example`: commented `NEXT_PUBLIC_TMDB_API_KEY`
- `frontend/next.config.ts`: `images.remotePatterns` restricted to `image.tmdb.org/t/p/**` (must allow Watchmode CDN artwork hosts + safe fallback rendering)
- `frontend/src/lib/utils.ts`: `tmdbImageUrl()` helper
- `frontend/src/lib/fixtures.ts`: `TMDB_IMAGE_BASE`, `tmdbPoster()`, `tmdbBackdrop()`, static TMDB fixture arrays
- `frontend/src/services/api.ts`: TMDB-specific error copy (`401`/`403`, `429`)
- `frontend/src/services/movieService.ts`: `TMDB_GENRE_FALLBACK_MAP`, `/api/movies/*` endpoints, TMDB mood map
- Components with TMDB labels/copy/helpers: `HomeDiscoveryClient.tsx`, `HiddenGems.tsx`, `DiscoverClient.tsx`, `MovieDetailClient.tsx`, `FeaturedHero.tsx`, `MovieCard.tsx`, `Navbar.tsx`, `Footer.tsx`, `discover/page.tsx`, `page.tsx`, `privacy/page.tsx`

### Documentation TMDB References
- `docs/api-documentation.md`, `docs/architecture.md`, `docs/database-schema.md`, `docs/development-log.md`, `README.md`

---

## 3. Existing User Features Audit

| Feature | Current Implementation | Migration Action |
|---|---|---|
| **Watchlist** | Browser `localStorage` (`cineverse_watchlist_prototype`) via `useWatchlist.ts` + `/watchlist` page | **Preserve** existing local items; upgrade to canonical content IDs + backend SQLite sync + legacy TMDB reconciliation support |
| **Ratings** | Schema planned only (`docs/database-schema.md`) | Implement user ratings API & UI on unified content details (feeding hybrid recommender incrementally) |
| **Collections** | Static placeholder at `/collections` | Keep existing UI route; add real user collection CRUD backed by canonical IDs |
| **Authentication / Profile** | Placeholder at `/profile` | Keep visual layout; add lightweight session/JWT-compatible user auth for personalized `/api/recommendations/*` & watchlist/ratings ownership (never trust raw `user_id` query params) |
| **MIRA Assistant** | Placeholder at `/assistant` + homepage `MiraPreview.tsx` | Preserve branding/UI; connect `/assistant` to real intent extraction + catalogue-grounded recommender |

---

## 4. Components Requiring Modification & Database Migrations Required

1. **Database Layer (New `backend/app/db/database.py`):** SQLite schema (`content_items`, `id_mappings`, `watchlist_items`, `user_ratings`, `collections`, `collection_items`, `users`, `api_credit_usage`) with indexes on `content_type`, `watchmode_id`, `imdb_id`, `legacy_tmdb_id`, `title`, and `release_year`. Preserves `legacy_tmdb_id` cleanly so existing bookmarks reconcile via `/api/content/resolve-legacy/tmdb/{tmdb_id}`.
2. **Backend Services & Routes:** Replace `TMDBService` runtime dependency with `WatchmodeService` (`X-API-Key` header auth, OpenAPI-verified `/list-titles`, `/autocomplete-search`, `/search`, `/genres`, `/status`, `/title/{id}/details`, `/title/{id}/sources`, `/title/{id}/seasons`, `/title/{id}/episodes`, `/title/{id}/cast-crew`), normalized `ContentSummary` / `ContentDetail` schemas, Documentary classification via genre metadata, and `/api/content/*` + `/api/recommendations/*` + `/api/mira/*` endpoints (with temporary `/api/movies/*` adapter until frontend migration completes).
3. **ML Modules (`backend/ml/`):** MovieLens ingestion pipeline (chunked processing for 32M + local small-dataset verification), IMDb-normalized ID mapper (`links.csv` -> Watchmode ID), TF-IDF content recommender, Sparse SVD collaborative model, Hybrid ranker, and leakage-resistant evaluation suite.
4. **Frontend Services & UI:** Update `next.config.ts` image domains (`cdn.watchmode.com`, etc.), replace `tmdbImageUrl` with provider-neutral `contentImageUrl()`, migrate components to `/api/content/*`, add `MOVIE` / `TV_SERIES` / `DOCUMENTARY` filtering, streaming availability badges, seasons/episodes on series details, Watchmode attribution, and live ML/MIRA pages while keeping CINEVERSE dark charcoal + purple/amber typography & layout intact.

---

## 5. Features That Must Remain Unchanged

- CINEVERSE visual design tokens (`#101014`, `#17161D`, `#1C1A23`, `#8060A8`, `#A68BC7`, `#D9A45D`, Playfair Display + Inter typography, `Container` 1440px responsive grid).
- Header navigation structure: `Home | Discover | Collections | My Watchlist | Search | MIRA | Profile`.
- All 8 homepage sections & interactive layout structure (`FeaturedHero`, `Trending Now`, `Popular Films`, `What's Your Mood Tonight?`, `Hidden Gems`, `Explore Your Universe`, `MiraPreview`, `PersonalisedPreview`).
- Strict policy against hardcoded mock fallbacks hiding API errors or exposing secrets.

---

## 6. Baseline Test & Build Status (Verified Before Migration Edits)

- **Backend `pytest -v`:** `13 passed, 1 warning in 3.51s` (`tests/test_health.py`, `tests/test_movies.py`).
- **Frontend `npm run lint` (`eslint`):** Passed (`exit code 0`).
- **Frontend `npx tsc --noEmit`:** Passed (`exit code 0`).
- **Frontend `npm run build` (`next build`):** Passed (`exit code 0`, 12 routes compiled).
- **Live Server Check Note:** `WATCHMODE_API_KEY` is currently unset in `backend/.env` and Windows environment variables; user must supply `WATCHMODE_API_KEY` for live Watchmode HTTP integration tests.

---

## 7. Rollback Strategy

- **Git Baseline:** Commit `30fd1f9` (`Project foundation`) holds the original Day 1 baseline; session diff patch `pre_watchmode_migration.patch` captures all Day 2–Day 3.1 uncommitted edits prior to Watchmode migration.
- **Credential Safety:** `backend/.env` and `frontend/.env.local` remain git-ignored and are only non-destructively extended (never overwritten).
- **Backward Compatibility:** During Checkpoints 2–3, legacy `/api/movies/*` routes and `/movie/[id]` routes remain bridged via canonical resolver endpoints so existing bookmarks and links continue functioning.
