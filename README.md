# Haxax — WA Tenement Intelligence

**AI mining tenement intelligence platform for Western Australia.** Haxax scans WA
tenements, historical project data, geology context, ownership and nearby activity,
then assigns each tenement an AI-generated **Haxax Score** and an analyst-style
opinion — helping investors, brokers, prospectors and small resource companies find,
analyse, rate and flip old or overlooked ground.

Map-first, single-operator console (no login) styled as a formal technical
instrument — Times New Roman, an "ink & forest" dark theme and an ivory-document
light theme.

> **Live data.** Tenement records (IDs, type, status, holder, dates, geometry, area)
> are pulled live from the public DMIRS / SLIP register. Some context fields are
> modelled or inferred (see **Live data** below). Decision-support only — not a
> valuation or financial advice.

---

## Quick start

```bash
npm install
npm run dev      # starts BOTH the web app (http://localhost:5173)
                 # and the live data API (http://localhost:8787)
```

`npm run dev` runs two processes via `concurrently`: Vite (web) and the Node
data service (`tsx watch server/index.ts`). Vite proxies `/api/*` to the service,
which fetches live WA tenement records on startup and every 30 minutes. On first
launch the app shows a splash while it connects, then renders live data. If the
service is unreachable it falls back to a bundled cached snapshot so the console
never goes blank (the pill in the top bar reads **LIVE** or **OFFLINE** accordingly).

```bash
npm run server   # run only the data API (port 8787)
npm run build    # production web bundle in dist/
npm run preview  # serve the built bundle
```

Requires Node 18+ (built on Node 25 / npm 11). The data API uses Node's built-in
`fetch`, so no extra runtime is needed.

---

## Live data

Real Western Australian mining-tenement records come from the public
**SLIP / DMIRS** ArcGIS REST service — *Mining Tenements (DMIRS-003)*, the same
dataset behind TENGRAPH — with **no API key required**. The Node service
(`server/index.ts`) queries live/pending mineral tenements per region, computes
each polygon's true area, and runs every record through the Haxax model.

- **Real, from the register:** tenement ID, licence type, status, holder(s),
  grant / start / expiry dates, boundary geometry, area, location.
- **Modelled on top of real inputs:** Haxax Score & factor breakdown, acquisition
  economics (implied EV, est. cost, max bid, flip uplift), within-region percentile,
  suggested call — all driven by the real dates / area / holder / location.
- **Inferred / synthesised (the register doesn't carry these):** commodity focus
  (from region), geology prose, drill-hole counts, comparables, native-title /
  heritage flags. These are deterministic per tenement ID so they're stable across
  refreshes. Coal & petroleum leases are excluded to keep the set mineral-focused.

`GET /api/data` returns the full payload; `GET /api/health` reports source, region
count and freshness; `GET /api/refresh` forces a re-pull. The Data Health page and
the top-bar pill reflect the real connection state.

---

## Tech stack

| Concern        | Choice                                                        |
| -------------- | ------------------------------------------------------------- |
| Web            | React 18 + TypeScript + Vite                                  |
| Data service   | Node (built-in `http` + `fetch`), run with `tsx`              |
| Routing        | react-router (HashRouter — portable, no server config)        |
| State          | Zustand (+ `persist` for theme, watchlist, deal pipeline)     |
| Icons          | lucide-react                                                  |
| Map            | Hand-built SVG of Western Australia (no tile-server / API key)|
| Charts         | Hand-rolled SVG (radial gauges, sparklines, EV/ha scatter)    |
| Styling        | Plain CSS with a token-based design system (dark/light)       |

The app loads live data from the API on startup, with the bundled deterministic
dataset (`seed.ts`) as an offline fallback.

---

## Project structure

```
server/
  index.ts      Live data API — SLIP/DMIRS fetch, normalise, cache, serve /api/*
src/
  lib/
    types.ts      Domain model (Tenement, Alert, Comp, ScoreFactor, …)
    geo.ts        WA projection, coastline, regions, faults, fly-to maths
    scoring.ts    Transparent 11-factor weighted scoring engine
    enrich.ts     Real raw tenement → full scored Haxax Tenement (shared by API)
    seed.ts       Deterministic bundled fallback dataset
    store.ts      Zustand store, data bootstrap (live + fallback), selectors
    format.ts     Number / date / currency / relative-time helpers
    hooks.ts      useClickOutside, useMediaQuery, useTick
  components/
    Logo, TopNav, NavRail, LiveTicker, CommandBar       (app chrome)
    WAMap                                               (the hero map)
    DetailDrawer, AIOpinionCard, ScoreBreakdown,
    TenementTimeline                                    (tenement workflow)
    ui.tsx                                              (primitives: chips,
                                                         badges, gauges, KPI…)
  pages/
    Overview, GroundMap, DealFlow, Watchlist,
    Alerts, Comparables, MemoGenerator, DataHealth
  styles/
    tokens.css    Colour / type / spacing / motion tokens + light theme
    base.css      Reset, typography, scrollbars, focus, a11y
    app.css       All component & layout styles
```

---

## What's implemented

- **Ground Intelligence Map** — interactive SVG of WA: pan, wheel-zoom (to cursor),
  zoom buttons, reset, and animated **fly-to region**. Tenements render as graticular
  polygons coloured by Haxax Score (green ≥85 / amber 60–84 / red <60), hover tooltips,
  click-to-select. Layer toggles for tenements, mines & deposits, geology domains,
  drill holes, faults/structures, competitor land, expiry risk, royalty/encumbrance and
  recent activity. **Scan mode** highlights clusters of underpriced / strategic ground.
  Legend + layer-opacity control.
- **Tenement workstation panel** — opens with a **decision strip** (BUY / FLIP / MONITOR /
  AVOID, conviction, Haxax Score and within-region percentile), then tabs:
  *Brief* (decision-led research note + signals + risk flags), *Economics*, *Score*,
  *Tenure* (register-grade metadata) and *Activity*.
- **Acquisition economics** — every tenement carries implied EV (from comps), estimated
  acquisition cost, recommended max bid, holding cost p.a., flip uplift %, likely strategic
  acquirers and a flip thesis — the buy-or-flip lens.
- **Tenure register** — mineral field, datum / MGA zone, centroid, graticular blocks,
  1:250k sheet, rent, minimum & committed expenditure, native title, heritage, LGA,
  survey status, last dealing — TENGRAPH/DMIRS-style depth.
- **Haxax Research Note** — a desk note (not a chatbot): model rating, verdict,
  "supports a bid / against a bid" reasons, thesis, confidence and next step.
- **Tenement register dock** — a sortable professional table docked under the map
  (score, holder, type, status, area, expiry, rent, implied EV, flip Δ, call) that stays
  synced with the map and panel.
- **Transparent scoring** — Haxax Score is exactly Σ(factor × weight) across 11 factors;
  the breakdown shows each factor's value, weight and point contribution and reconciles
  to the headline number.
- **Overview**, **Deal Flow** (drag-and-drop kanban), **Watchlist** (sortable),
  **Alerts** (typed + severity), **Comparables** (EV/ha scatter + table + subject compare),
  **IC Memo Generator** (export-style memo), **Data Health** (pipeline + source coverage).
- **Live feed** ticker with a simulated event stream; "last updated" timestamps; ⌘K
  command palette; global search; dark/light themes; responsive desktop→mobile; loading
  skeletons, empty states; keyboard-accessible controls.

State for theme, watchlist and the deal pipeline persists to `localStorage`.

---

## Backend architecture — connecting real WA data

The frontend is intentionally structured for easy wiring: every screen reads from
typed models in `lib/types.ts`, and all data flows through the Zustand store and a few
pure selectors. Replacing `lib/seed.ts` with API calls is the main integration seam.

### 1. Ingestion (sources → raw lake)
Scheduled connectors per source, landing immutable raw extracts (object storage +
manifest):
- **TENGRAPH / DMIRS** — tenement geometries, status, holders, dealings, expiry
  (WFS/GeoJSON + the public mining tenement datasets).
- **MINEDEX** — mines, deposits, resources/operating status.
- **GeoVIEW.WA / GSWA** — geology polygons, geophysics, structural lineaments, drill
  collars (WMS/WFS).
- **WAMEX** — open-file exploration reports (PDF/zip → text + assays via OCR/NLP).
- **NNTT** — native title claims/determinations; **Landgate** — cadastre/heritage.
- **Market** — ASX announcements, capital raisings, commodity prices.

Orchestrate with Airflow / Dagster / Temporal; CDC where feeds expose change streams.

### 2. Normalise & geospatial store
- **PostgreSQL + PostGIS** as the system of record. Conform to a canonical schema
  (mirrors `Tenement`, `Deposit`, `DrillHole`, `Event`, `CompTxn`, `Holder`).
- Spatial joins compute the relationships the UI shows: nearest producing mines,
  adjacency to known projects, fault proximity, drill-hole density, competitor overlap.
- Tile the map for production with **Mapbox/MapLibre + vector tiles** (Martin/Tegola)
  or PMTiles — swap the hand-built SVG for a real basemap with the same overlay layers.

### 3. Scoring pipeline
- Keep the **transparent weighted model** as the explainable baseline (it already
  decomposes cleanly and is auditable per factor) — store every factor value + weight +
  contribution per tenement so the breakdown is reproducible and versioned.
- Layer ML on top: gradient-boosted / learned re-rating trained on realised comp
  transactions, with **SHAP attributions** feeding the same "upside/risk reasons" UI.
- Generate the **AI Opinion** with an LLM over a retrieval context (the tenement record,
  WAMEX summaries, neighbour activity), constrained to cite only stored facts; cache by
  `(tenementId, dataVersion)`. Recompute on data change, not per request.

### 4. Alert & event engine
- A rules engine (e.g. Materialize / Flink / a Temporal worker) over the event stream:
  expiry windows, title/holder changes, competitor pegging, district heat, data
  anomalies, strategic-adjacency triggers — exactly the alert types in the UI.
- Emit to a notifications service (in-app feed via WebSocket/SSE, email, webhook). The
  live ticker and Alerts page are already WebSocket-shaped.

### 5. API & app
- **GraphQL or typed REST (tRPC/OpenAPI)** exposing tenement search/filter, detail,
  score breakdown, comps, alerts, deal pipeline and memo generation. Server-side
  filtering/pagination mirrors the current `applyFilters`.
- **Auth & multi-tenant**: org workspaces, SSO (OIDC), row-level security for private
  watchlists/pipelines; audit log for IC memos.
- **Persistence**: move watchlist / deal stages / memos from `localStorage` to the API.
- **Deploy**: containerised API + Postgres/PostGIS (+ PostGIS read replicas), object
  storage for raw + memo PDFs, a queue (SQS/NATS) between ingestion → scoring → alerts,
  and a CDN-served SPA. Observability on pipeline freshness powers the Data Health page
  for real.

**Integration order:** PostGIS schema + TENGRAPH/MINEDEX ingestion → spatial-join
features → scoring service → REST/GraphQL → swap `seed.ts` for the API → alert engine
+ WebSocket feed → auth & persistence.
