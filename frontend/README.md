# CINEVERSE Frontend

<div align="center">

```
  ██████╗██╗███╗   ██╗███████╗██╗   ██╗███████╗██████╗ ███████╗███████╗
 ██╔════╝██║████╗  ██║██╔════╝██║   ██║██╔════╝██╔══██╗██╔════╝██╔════╝
 ██║     ██║██╔██╗ ██║█████╗  ██║   ██║█████╗  ██████╔╝███████╗█████╗  
 ██║     ██║██║╚██╗██║██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗╚════██║██╔══╝  
 ╚██████╗██║██║ ╚████║███████╗ ╚████╔╝ ███████╗██║  ██║███████║███████╗
  ╚═════╝╚═╝╚═╝  ╚═══╝╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝
                            FRONTEND APPLICATION
```

**Cinematic Luxury User Experience & Conversational AI Interface**  
*Built with Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, and Framer Motion.*

[![Next.js](https://img.shields.io/badge/Next.js-16.4.6-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.x-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Framer Motion](https://img.shields.io/badge/Framer%20Motion-12.x-black?logo=framer)](https://www.framer.com/motion)

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Design System & Aesthetics](#-design-system--aesthetics)
- [Architecture & Directory Structure](#-architecture--directory-structure)
- [Page Routes & Views](#-page-routes--views)
- [MIRA Floating AI Chatbot Widget](#-mira-floating-ai-chatbot-widget)
- [State Management & Contexts](#-state-management--contexts)
- [Image Pipeline & Remote Hosts](#-image-pipeline--remote-hosts)
- [Setup & Local Development](#-setup--local-development)
- [Scripts Reference](#-scripts-reference)
- [Testing & Quality Verification](#-testing--quality-verification)

---

## 🌟 Overview

The **CINEVERSE Frontend** is a modern, high-performance web application designed to deliver an immersive cinematic movie discovery experience. Powered by **Next.js 16 App Router** with Turbopack, it integrates:

- A dark, glassmorphic design system evoking high-end editorial and theatrical platforms.
- Deep, multi-filter exploration across **Movies**, **TV Series**, and **Documentaries** backed by real-time Watchmode data.
- **MIRA AI Floating Concierge:** A persistent, non-intrusive floating chatbot widget available globally across all routes.
- **Taste DNA:** A rich interactive dashboard displaying personalized genre affinity, content-type distributions, and interaction histories.
- **Product Analytics Dashboard:** An administrative analytics view displaying platform KPIs and user engagement funnels.

---

## 🎨 Design System & Aesthetics

The application implements the **Cinematic Luxury** design system:

### Color Palette

| Token | Hex Value | Usage |
|---|---|---|
| **Primary Background** | `#101014` | Deep charcoal canvas across all pages |
| **Surface Elevated** | `#17161D` | Cards, panels, dropdowns, and modals |
| **Card Surface** | `#14131A` | Interactive content card containers |
| **Primary Text** | `#F5F2F7` | Headings, titles, high-emphasis copy |
| **Secondary Text** | `#AAA5B3` | Body copy, descriptions, subtitles |
| **Muted Text** | `#77727F` | Metadata, tags, placeholders, timestamps |
| **Violet Accent** | `#8060A8` / `#A68BC7` | Primary brand color, MIRA badge, active states |
| **Amber Accent** | `#D9A45D` | Ratings, highlights, VIP indicators |
| **Success / Online** | `#34D399` | Live MIRA connection status |
| **Border Subtle** | `rgba(255, 255, 255, 0.08)` | Refined card and divider borders |

### Typography

- **UI & Body:** **Inter** (`var(--font-inter)`) — Clean, geometric sans-serif for exceptional legibility at all font sizes.
- **Editorial Display:** **Playfair Display** (`var(--font-playfair)`) — Used selectively for hero titles, section headings, and quotes to establish editorial elegance.

---

## 📁 Architecture & Directory Structure

```
frontend/
├── package.json                   # Dependencies, scripts, and package metadata
├── next.config.ts                 # Turbopack options & remote image domain allowlisting
├── tsconfig.json                  # TypeScript compiler settings and path aliases (@/* -> src/*)
├── postcss.config.mjs             # PostCSS processing
├── eslint.config.mjs              # ESLint 9 configuration with React Hooks & TypeScript rules
├── tests/                         # Node.js contract test suite (frontend_contracts.test.mjs)
│
└── src/
    ├── app/                       # Next.js 16 App Router Routes
    │   ├── layout.tsx             # Root layout with Inter, Playfair, MiraWidgetProvider
    │   ├── page.tsx               # Homepage (Hero, Carousels, Spotlight, MiraPreview)
    │   ├── globals.css            # Tailwind 4 theme imports and design tokens
    │   ├── discover/              # Catalog Discovery with multi-filter search
    │   ├── movie/[id]/            # Detailed title page (streaming platforms, credits, trailer)
    │   ├── collections/           # SQLite-backed custom collections manager
    │   ├── watchlist/             # Watchlist view with quick management actions
    │   ├── profile/               # Taste DNA profile, profile switcher, model metrics
    │   ├── admin/                 # Product Analytics Dashboard (KPIs, searches, top titles)
    │   ├── assistant/             # MIRA dedicated landing (auto-opens floating widget)
    │   ├── about/                 # Platform mission and architecture overview
    │   ├── privacy/               # Privacy policy and local-first data storage details
    │   └── not-found.tsx          # Cinematic 404 error page
    │
    ├── components/
    │   ├── assistant/
    │   │   ├── MiraFloatingWidget.tsx  # Universal Floating Chatbot (Desktop & Mobile)
    │   │   └── MiraChatClient.tsx      # Standalone assistant layout support
    │   ├── discover/
    │   │   └── DiscoverClient.tsx      # Multi-filter interactive discovery engine
    │   ├── home/
    │   │   ├── HeroBanner.tsx          # Dynamic cinematic hero with backdrop
    │   │   ├── MovieCarousel.tsx       # Horizontal scrolling content rails
    │   │   └── MiraPreview.tsx         # Homepage MIRA introduction with starter prompts
    │   ├── layout/
    │   │   ├── Navbar.tsx              # Persistent top bar (Desktop grid & MIRA toggle)
    │   │   ├── MobileNav.tsx           # Slide-in mobile drawer navigation
    │   │   ├── Footer.tsx              # Site footer with brand & directory links
    │   │   └── Container.tsx           # Centered responsive content boundary
    │   ├── movies/
    │   │   ├── MovieCard.tsx           # Reusable poster card with rating & watchlist
    │   │   ├── MovieDetailClient.tsx   # Comprehensive title view with streaming links
    │   │   └── PosterFallback.tsx      # Graceful SVG placeholder when images are absent
    │   └── ui/
    │       ├── Button.tsx              # Styled interactive buttons (primary, secondary, ghost)
    │       ├── LoadingState.tsx        # Skeleton loaders for movies, grids, and details
    │       └── BackendStatus.tsx       # Live FastAPI connection monitor
    │
    ├── context/
    │   └── MiraWidgetContext.tsx       # Global state provider for floating MIRA widget
    │
    ├── hooks/
    │   └── useWatchlist.ts             # Custom hook managing local & SQLite watchlist syncing
    │
    ├── lib/
    │   ├── utils.ts                    # Image URL resolvers, clamp, year formatters
    │   └── userContext.ts              # Active user switching (local-default, cinephile, etc.)
    │
    ├── services/
    │   ├── api.ts                      # Centralized fetch client with base URL prepend
    │   ├── movieService.ts             # Calls to Watchmode content endpoints
    │   ├── miraService.ts              # Calls to MIRA conversational API & feedback loops
    │   ├── libraryService.ts          # Calls to collections, ratings, and preferences
    │   └── analyticsService.ts        # Client-side 12-event tracking pipeline
    │
    └── types/
        └── index.ts                    # Complete TypeScript domain interfaces (Movie, MiraMessage, etc.)
```

---

## 🗺 Page Routes & Views

| Route | Type | Description |
|---|---|---|
| `/` | Static / SSR | **Homepage:** Hero banner, trending content rows, Spotlight movie, MIRA interactive teaser. |
| `/discover` | Dynamic | **Discover Catalog:** Real-time multi-filter by format, genre, year, rating, and region. |
| `/movie/[id]` | Partial Prerender | **Title Details:** Full synopsis, director, cast, trailer embed, and regional streaming sources. |
| `/collections` | Dynamic | **Collections:** Create custom themed playlists, add items from Watchlist, remove items. |
| `/watchlist` | Dynamic | **My Watchlist:** Overview of saved titles with instant one-click removal and detail links. |
| `/profile` | Dynamic | **Taste DNA:** Genre affinity radar, favorite content types, profile switcher, ML metrics. |
| `/admin` | Dynamic | **Analytics Dashboard:** Platform metrics, DAU, top searches, conversion rates (auth via `X-Admin-Key`). |
| `/assistant` | Dynamic | **MIRA Landing:** Welcoming cinematic intro that automatically opens the floating widget. |
| `/about` | Static | **About CINEVERSE:** Mission, internship context, and architectural breakdown. |
| `/privacy` | Static | **Privacy Policy:** Transparent local-first and anonymous tracking explanation. |

---

## 🤖 MIRA Floating AI Chatbot Widget

The primary highlight of the frontend navigation overhaul is the **Floating MIRA AI Widget** ([`MiraFloatingWidget.tsx`](file:///C:/Users/Kajal%20kumari/OneDrive/Desktop/CINEVERSE/frontend/src/components/assistant/MiraFloatingWidget.tsx)):

```
┌──────────────────────────────────────────────┐
│  MIRA  ● Live        [IN ▾]  [↺ New] [-] [X] │
├──────────────────────────────────────────────┤
│                                              │
│  Hi, I'm MIRA — your AI film assistant.     │
│  Ask naturally or tap a recommendation below:│
│                                              │
│  [ Recommend a thriller movie.          ✨ ] │
│  [ Suggest underrated documentaries.     ✨ ] │
│  [ Find something similar to Interstellar.✨ ] │
│  [ Recommend a series for the weekend.   ✨ ] │
│                                              │
├──────────────────────────────────────────────┤
│  [Ask MIRA (e.g. 'Underrated sci-fi')...] [>]│
└──────────────────────────────────────────────┘
```

### Key Capabilities

1. **Lower-Right Corner Positioning:** Sits unobtrusively in the bottom-right corner (`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50`).
2. **Background Page Interaction:** The underlying page remains 100% interactive — users can browse Discover, view trailers, or add movies to their watchlist while talking to MIRA.
3. **Smooth State Transitions (Framer Motion):**
   - **Closed:** Subtle glowing circular button with pulsing live badge.
   - **Minimized:** Compact floating status bar (`MIRA Active`, expand button, close button).
   - **Maximized:** Full 450px wide chat window (desktop) or adaptive full-width sheet (mobile).
4. **Starter Prompts:** 4 instant suggestion cards sending direct queries into the backend recommendation pipeline.
5. **Rich Recommendation Cards:** Each card includes poster art, star rating, runtime, streaming platforms (Netflix, Prime, Hotstar, etc.), explanation rationale, and 5 instant feedback actions (*Like*, *Dislike*, *Watched*, *More like this*, *Less like this*).

---

## ⚡ State Management & Contexts

### `MiraWidgetContext` (`src/context/MiraWidgetContext.tsx`)
Provides centralized control over the floating widget lifecycle:
```tsx
const {
  isOpen,            // Whether the widget is open
  isMinimized,       // Whether the widget is minimized to a compact bar
  openMira,          // Function to open MIRA (optionally pre-loading a prompt)
  closeMira,         // Function to close MIRA
  toggleMira,        // Function to toggle between open and closed
  minimizeMira,      // Function to collapse into minimized bar
  maximizeMira,      // Function to expand from minimized bar
  queuedPrompt,      // Pending prompt passed from external components
} = useMiraWidget();
```
- Embedded at the highest level in `RootLayout`, ensuring that navigating between pages (`/` → `/discover` → `/collections`) **never destroys the widget state or active conversation**.

### `useWatchlist` (`src/hooks/useWatchlist.ts`)
- Manages synchronized watchlist storage using local browser storage with automatic SQLite backend hydration.
- Exports `isInWatchlist(id)`, `toggleWatchlist(movie)`, and `clearWatchlist()`.

---

## 🖼 Image Pipeline & Remote Hosts

To guarantee movie posters and hero backdrops load reliably without broken image icons, Next.js remote patterns are explicitly configured in [`next.config.ts`](file:///C:/Users/Kajal%20kumari/OneDrive/Desktop/CINEVERSE/frontend/next.config.ts):

```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'cdn.watchmode.com' },
    { protocol: 'https', hostname: 'image.tmdb.org' },
    { protocol: 'https', hostname: 'images.unsplash.com' },
  ],
}
```

The resolver function `contentImageUrl()` in `src/lib/utils.ts` validates image sources and delegates gracefully to [`PosterFallback.tsx`](file:///C:/Users/Kajal%20kumari/OneDrive/Desktop/CINEVERSE/frontend/src/components/movies/PosterFallback.tsx) when images are absent.

---

## 🛠 Setup & Local Development

### Prerequisites

- **Node.js:** `v20.x` or higher
- **Backend API:** FastAPI running on `http://127.0.0.1:8000`

### Installation

```bash
cd frontend
npm install
```

### Environment Configuration

Create a `.env.local` file in the `frontend/` directory:

```ini
# Backend API Base URL
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000

# Admin Key for Analytics Dashboard (/admin)
NEXT_PUBLIC_ADMIN_KEY=cineverse-admin-secret-key
```

### Start Development Server

```bash
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

## 📜 Scripts Reference

| Script | Command | Purpose |
|---|---|---|
| `dev` | `npm run dev` | Starts Next.js dev server with Turbopack |
| `build` | `npm run build` | Compiles optimized production build across all routes |
| `start` | `npm run start` | Runs the compiled Next.js production server |
| `lint` | `npm run lint` | Executes ESLint 9 checks across all TypeScript files |
| `typecheck` | `npx tsc --noEmit` | Runs strict TypeScript type checking without emitting JS |

---

## 🧪 Testing & Quality Verification

### 1. Contract Tests
Run the contract test suite to verify route existence, image host allowlisting, and analytics event definitions:
```bash
node --test tests/frontend_contracts.test.mjs
```

### 2. End-to-End Headless Edge CDP Verification
The automated browser verification script tests real user interactions in headless Microsoft Edge:
- Opens Home page at 1440px desktop resolution.
- Toggles floating MIRA widget from the Navbar without navigating away.
- Validates the 4 starter prompts.
- Tests Minimize, Maximize, and Close actions.
- Tests live recommendation generation from the FastAPI backend.
- Tests navigation to `/collections` and `/profile`, ensuring Navbar persistence.
- Validates mobile responsiveness on a 390px viewport.
