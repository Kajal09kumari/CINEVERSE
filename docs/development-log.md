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
- [ ] Design the full CINEVERSE homepage UI
- [ ] Add the AGENTS.md file for AI coding guidelines
