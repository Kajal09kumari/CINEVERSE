# CINEVERSE — Development Log

---

## Day 1 — Project Foundation & Architecture

**Date:** 2026-11-10  
**Goal:** Establish the full project structure, initialise both servers, verify frontend-backend communication.

---

### Pre-work: Workspace Audit

Before writing any code, the existing workspace was inspected.

**Findings:**

| Item | Status |
|---|---|
| `frontend/` | ✅ Existed — Next.js 16.4.6 scaffold from `create-next-app` |
| `frontend/src/` | ❌ Missing — app files were at `frontend/app/` (no src/ wrapper) |
| `framer-motion` | ❌ Not installed |
| `lucide-react` | ❌ Not installed |
| `backend/` | ❌ Missing — created from scratch |
| Python venv | ❌ Missing — created fresh |
| `docs/` | ❌ Missing — created |
| `.gitignore` | ❌ Missing — created |
| `.git` | ✅ Existed — on `master` branch, no commits yet |
| Python version | ✅ 3.15.2 (system) |
| Node.js | ✅ Available |

**Decision made:** Existing Next.js files were not discarded. The `frontend/app/` structure was migrated to `frontend/src/app/` to match the target architecture. Only the auto-generated placeholder content was replaced.

---

### Activities Completed

#### 1. Frontend Restructuring

- Created `frontend/src/` directory structure as per architecture spec.
- Migrated `frontend/app/` → `frontend/src/app/`.
- Replaced default Next.js placeholder `page.tsx` with CINEVERSE entry point.
- Replaced default `layout.tsx` with CINEVERSE metadata and Inter font.
- Replaced default `globals.css` with CINEVERSE cinematic design system (CSS custom properties for the full colour palette).
- Updated `tsconfig.json` path alias from `@/*` → `./src/*`.

#### 2. Frontend New Files Created

| File | Purpose |
|---|---|
| `src/app/layout.tsx` | Root layout with Inter font and CINEVERSE metadata |
| `src/app/page.tsx` | Day 1 placeholder page with backend connection check |
| `src/app/globals.css` | CINEVERSE design token system |
| `src/services/api.ts` | Centralised API client with typed `apiRequest()` |
| `src/components/ui/BackendStatus.tsx` | Backend connection indicator component |
| `src/types/index.ts` | Shared TypeScript types (Movie, User, Recommendation, etc.) |
| `src/lib/utils.ts` | Utility functions (TMDB image URLs, formatting, etc.) |
| `.env.local.example` | Environment variable template |
| `.env.local` | Local development environment (not committed) |

#### 3. Frontend Packages Installed

```
npm install framer-motion lucide-react
```

| Package | Version | Purpose |
|---|---|---|
| `framer-motion` | Latest | Animation library for smooth UI transitions |
| `lucide-react` | Latest | Icon library used throughout the UI |

#### 4. Backend Created from Scratch

Directory structure created:

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          ← FastAPI application entry point
│   ├── api/
│   │   └── routes/
│   │       └── health.py  ← GET / and GET /health
│   └── core/
│       └── config.py    ← Settings (pydantic-settings)
├── ml/
│   ├── data/
│   ├── preprocessing/
│   ├── models/
│   ├── evaluation/
│   └── notebooks/
├── tests/
│   └── test_health.py
├── requirements.txt
├── .env.example
└── .env
```

#### 5. Backend Dependencies Installed

Virtual environment created at `backend/venv/`.

```
pip install fastapi[standard] pandas numpy scikit-learn scipy joblib python-dotenv httpx pydantic-settings pytest uvicorn[standard]
```

#### 6. Root Level Files Created

| File | Purpose |
|---|---|
| `.gitignore` | Excludes secrets, venv, node_modules, ML artifacts |
| `README.md` | Project overview, installation, running instructions |
| `docs/architecture.md` | Full system architecture with Mermaid diagram |
| `docs/development-log.md` | This file |
| `docs/database-schema.md` | Planned — Day 2 |
| `docs/api-documentation.md` | Planned — when first real endpoints are built |

---

### Commands Executed

```bash
# Frontend
cd frontend
npm install framer-motion lucide-react

# Backend
python -m venv backend/venv
backend/venv/Scripts/pip install fastapi[standard] pandas numpy scikit-learn scipy joblib python-dotenv httpx pydantic-settings pytest uvicorn[standard]

# Backend server verification
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Git
git init  (already existed)
git add .
git commit -m "chore: initialise CINEVERSE project architecture"
```

---

### Endpoint Tests

#### GET /

```
Response: 200 OK
Body: {"message": "Welcome to CINEVERSE API", "status": "running"}
```

#### GET /health

```
Response: 200 OK
Body: {"status": "healthy", "project": "CINEVERSE"}
```

---

### Design Decisions Explained

**Why CSS custom properties for the design system?**  
CSS variables are native, cascade correctly with Tailwind 4, and allow the entire colour palette to be changed in one place. This is better than scattering Tailwind utility classes with specific hex values everywhere.

**Why is `api.ts` a service module rather than individual fetch calls?**  
Centralising API communication means: (1) the base URL is controlled by one env variable, (2) error handling is consistent, (3) in future we can swap fetch for a different HTTP client without touching components.

**Why not use `'use client'` in `layout.tsx`?**  
The root layout is a server component. This means the HTML shell, metadata, and fonts are rendered on the server. Only components that need interactivity (like `BackendStatus.tsx`, which uses `useEffect`) are marked as client components.

**Why is `BackendStatus.tsx` a Day 1 component?**  
It proves the entire stack is working end-to-end: frontend → HTTP request → backend → response. This is the simplest possible integration test. It will be removed from the homepage in later days.

---

### Issues Encountered

| Issue | Solution |
|---|---|
| `frontend/app/` existed instead of `frontend/src/app/` | Migrated files, updated `tsconfig.json` path aliases |
| `framer-motion` and `lucide-react` not installed | Installed via `npm install` |
| `backend/` did not exist | Created from scratch |

---

### Pending Tasks (Day 2+)

- [ ] Design and create the Supabase database schema (`docs/database-schema.md`)
- [ ] Implement Supabase connection in the backend
- [ ] Begin TMDB API integration
- [ ] Download and preprocess the movie dataset for ML
- [ ] Build the first ML notebook (exploratory data analysis)
- [x] Design the full CINEVERSE homepage UI (completed Day 2)
- [ ] Add the AGENTS.md file for AI coding guidelines

---

## Day 2 — Cinematic UI Design System & Complete Homepage

**Date:** 2026-11-11  
**Goal:** Establish CINEVERSE's cinematic luxury visual identity, reusable UI/movie component architecture, complete homepage, and functional placeholder routes.

---

### Pre-work: Frontend Audit

Before editing any frontend files, `frontend/` was inspected:
- Confirmed Next.js `16.4.6` (App Router), React `19.3.0`, TypeScript `5`, Tailwind CSS `4.3.3`.
- Confirmed `framer-motion` (`14.11.1`) and `lucide-react` (`1.71.0`) were already installed in `package.json`.
- Identified missing `images.remotePatterns` in `next.config.ts` for TMDB CDN artwork, missing Playfair Display font in `layout.tsx`, and Day 1 placeholder tokens/page.

---

### Design System Implemented

- **Palette (`src/app/globals.css`):**
  - Primary background: `#101014`
  - Secondary surface: `#17161D`
  - Card surface: `#1C1A23`
  - Accents: Muted violet (`#8060A8`), Soft violet (`#A68BC7`), Warm amber (`#D9A45D`)
  - Text hierarchy: Primary (`#F5F2F7`), Secondary (`#AAA5B3`), Muted (`#77727F`)
  - Subtle borders: `rgba(255, 255, 255, 0.08)`
- **Typography (`src/app/layout.tsx`):**
  - Editorial headings: `Playfair Display` (`--font-playfair`)
  - Body & UI: `Inter` (`--font-inter`)
- **Motion & Accessibility:**
  - Restrained Framer Motion entrance/hover transitions, `prefers-reduced-motion` media query support, semantic landmarks, and visible focus outlines.

---

### Files Created & Modified

**Modified:**
- `frontend/next.config.ts` — configured `images.remotePatterns` for `https://image.tmdb.org/t/p/**`.
- `frontend/src/app/globals.css` — applied the Day 2 colour tokens, typography utilities, carousel scrollbar hiding, and reduced-motion rules.
- `frontend/src/app/layout.tsx` — loaded `Inter` and `Playfair Display` via `next/font/google`.
- `frontend/src/app/page.tsx` — replaced Day 1 placeholder with the composed CINEVERSE homepage.

**Created:**
- `frontend/src/lib/fixtures.ts` — typed local movie fixture dataset (`HERO_MOVIE`, `TRENDING_MOVIES`, `HIDDEN_GEMS`, `SAMPLE_PICKS`) and TMDB image URL helpers.
- `frontend/src/hooks/useWatchlist.ts` — `useSyncExternalStore` + `localStorage` watchlist prototype hook.
- `frontend/src/components/ui/Button.tsx` — four-variant button (`primary`, `secondary`, `ghost`, `amber`).
- `frontend/src/components/ui/SectionHeading.tsx` — editorial section heading with overline and optional serif styling.
- `frontend/src/components/ui/LoadingState.tsx` — skeleton placeholders (`Skeleton`, `MovieCardSkeleton`, `HeroSkeleton`).
- `frontend/src/components/layout/Navbar.tsx` — scroll-aware sticky navigation bar with `<Suspense>`, Clapperboard logo, interactive search dialog, MIRA shortcut, and profile link.
- `frontend/src/components/layout/MobileNav.tsx` — responsive slide-in mobile drawer.
- `frontend/src/components/layout/Footer.tsx` — editorial footer.
- `frontend/src/components/movies/FeaturedHero.tsx` — 72–82vh layered cinematic hero with working watchlist toggle.
- `frontend/src/components/movies/MovieCard.tsx` — poster card with hover synopsis overlay and graceful SVG fallback.
- `frontend/src/components/movies/MovieCarousel.tsx` — native horizontal scroll carousel with edge fades and scroll buttons.
- `frontend/src/components/movies/MovieSection.tsx` — reusable responsive movie grid wrapper.
- `frontend/src/components/movies/MovieDetailClient.tsx` — interactive detail view for preview movies.
- `frontend/src/components/home/MoodDiscovery.tsx` — 6 mood categories routing to `/discover?mood=`.
- `frontend/src/components/home/HiddenGems.tsx` — editorial 1+3 feature layout for overlooked films.
- `frontend/src/components/home/GenreExplorer.tsx` — 10-genre bento grid routing to `/discover?genre=`.
- `frontend/src/components/home/MiraPreview.tsx` — MIRA preview section with static prompt starters.
- `frontend/src/components/home/PersonalisedPreview.tsx` — sample picks section with clear non-ML disclosure.
- `frontend/public/images/poster-placeholder.svg` & `backdrop-placeholder.svg` — fallback artwork.
- Route pages: `src/app/discover/page.tsx`, `src/app/watchlist/page.tsx`, `src/app/collections/page.tsx`, `src/app/assistant/page.tsx`, `src/app/movie/[id]/page.tsx`, `src/app/profile/page.tsx`, `src/app/about/page.tsx`, `src/app/privacy/page.tsx`.

---

### Verification & Issues Resolved

- **Lint (`npm run lint`):** Passed (0 errors, 0 warnings). Resolved a React 19 `react-hooks/set-state-in-effect` error in `useWatchlist.ts` by refactoring to `useSyncExternalStore`.
- **TypeScript (`npx tsc --noEmit`):** Passed (0 errors) after regenerating Next.js route types (`npx next typegen`) and tightening `as const` easing tuples.
- **Production Build (`npm run build`):** Passed (exit code 0, all 12 static/partial-prerender routes built) after replacing `new Date()` in `Footer.tsx` with a static year constant and wrapping `NavbarContent` in `<Suspense>` for Next.js 16 `cacheComponents` compatibility.
- **Runtime Route Verification:** Started `next start` on `127.0.0.1:3000` and confirmed HTTP `200` across `/`, `/discover`, `/discover?mood=mind-bending`, `/discover?genre=Science%20Fiction`, `/collections`, `/watchlist`, `/assistant`, `/movie/157336`, `/profile`, `/about`, and `/privacy`.
- **Browser Visual Check:** Not executed in this session (no browser automation tool available); recommended for manual inspection at desktop, tablet, and mobile viewports.

---

### Pending Features (Day 3+)

- [ ] Live TMDB API integration in FastAPI backend (`Day 3`) — completed below
- [ ] PostgreSQL / Supabase schema & authentication (`docs/database-schema.md`)
- [ ] Content-based, collaborative, and hybrid ML recommendation pipeline (`Day 4`)
- [ ] Conversational MIRA backend & `/assistant` interface (`Day 5`)

---

## Day 3 — Final UI Refinement, TMDB API Integration & Smart Movie Discovery

**Date:** 2026-11-11  
**Goal:** Complete pending Day 2 UI alignment/spacing/card refinements, build secure server-side TMDB v3 integration in FastAPI, and connect Homepage, `/discover`, Navbar search, and `/movie/[id]` dynamically.

---

### Pre-work: Workspace Audit Findings

- Backend had `health.py`, `config.py`, `main.py`, and `test_health.py`, while `services/`, `schemas/`, and `/api/movies/*` routes did not yet exist.
- `backend/.env` had `TMDB_ACCESS_TOKEN=` empty (`Settings.has_tmdb_token == False`).
- Frontend `src/lib/fixtures.ts` still drove Homepage, Discover, Navbar search, Hidden Gems, and Movie Detail routes.

---

### Completed Work

#### 1. Backend TMDB Service & Endpoints
- Updated `backend/app/core/config.py`: added `tmdb_base_url`, `has_tmdb_token`, and debug-safe `allowed_origins` (`localhost:3000` & `127.0.0.1:3000`).
- Created `backend/app/schemas/movie.py`: Pydantic v2 schemas (`Genre`, `MovieSummary`, `MovieDetail`, `MovieListResponse`, `GenreListResponse`, `SortByParam`, `SORT_BY_MAP`).
- Created `backend/app/services/tmdb_service.py`: async `TMDBService` using a managed `httpx.AsyncClient`, Bearer token auth, bounded `_TTLCache`, response normalization, and sanitized domain exceptions (`TMDBConfigError`, `TMDBNotFoundError`, `TMDBTimeoutError`, `TMDBAPIError`).
- Created `backend/app/api/routes/movies.py` mounted under `/api/movies`:
  - `GET /api/movies/trending`, `GET /api/movies/popular`, `GET /api/movies/search`, `GET /api/movies/genres`, `GET /api/movies/discover`, `GET /api/movies/genre/{genre_id}`, `GET /api/movies/{movie_id}`, `GET /api/movies/{movie_id}/similar`.
- Updated `backend/app/main.py` with FastAPI `lifespan` cleanup and `movies_router`.
- Created `backend/tests/test_movies.py`: 9 automated tests using `httpx.MockTransport` covering all 8 endpoints, pagination, combined filters, invalid query validation (`400`/`422`), `404`, missing token (`503`), upstream `500` -> `502`, and timeout `504` without secret leakage.

#### 2. Frontend UI Refinement & Dynamic Integration
- Updated `frontend/src/types/index.ts`, `frontend/src/lib/utils.ts`, `frontend/src/services/api.ts` (`ApiError`), and created `frontend/src/services/movieService.ts`.
- Updated `frontend/src/hooks/useWatchlist.ts` and `MovieCard.tsx` to unified `Movie` types, uniform card heights, and **two-line title support** (`line-clamp-2 min-h-[2.45rem]`).
- Tightened Homepage section rhythm (`space-y-14 lg:space-y-[72px] pt-10 lg:pt-12`) and refined `MoodDiscovery.tsx` (`min-h-[176px]`).
- Connected Homepage (`HomeDiscoveryClient.tsx`, `HiddenGems.tsx`), live debounced `Navbar.tsx` search, full `/discover` (`DiscoverClient.tsx` with search, genres, mood translation, language, year, min rating, sorting, active filter chips, pagination), and `/movie/[id]` (`MovieDetailClient.tsx` + metadata-based TMDB similar films).
- Enforced strict no-silent-fake-fallback error handling: displays explicit API error details and working Retry actions when `TMDB_ACCESS_TOKEN` is unconfigured or backend is unreachable.

#### 3. Verification Results
- Backend `pytest -v`: **11/11 tests passed** (`test_health.py` + `test_movies.py`).
- Frontend `npm run lint`, `npx tsc --noEmit`, `npm run build`: **0 errors, 0 warnings, 12 routes built cleanly**.
- Headless Edge CDP audit across `1920x1080`, `1440x900`, `1024x768`, `768x1024`, and `390x844` on `/`, `/discover`, and `/movie/157336`: **0 horizontal overflow (`scrollWidth === innerWidth`)** and exact container left alignment verified.


