# joetracks-backend

Serverless backend for joetracks.com, built on Cloudflare Workers + Hono.

This worker powers multiple site features:

## 1. Page Editor / CMS

Routes under `/api/pages/*`  
Handles page storage, updates, and retrieval via D1.

## 2. Blog API

Routes under `/api/blog/*`  
CRUD operations for blog posts stored in D1.

## 3. Portfolio API

Routes under `/api/portfolio/*`  
Manages the portfolio/projects section on the site.

## 4. Michigan Ski Tracker API

Routes under `/api/ski/*`  
Provides NOAA-powered forecasts for Michigan ski resorts.
(See "ski tracker" section below.)

---

## Michigan Ski Tracker (Detailed)

### Purpose

Snowfall and conditions forecasts for 41 Michigan ski areas, from NOAA point
data at each resort's mid-mountain coordinates.

### Endpoints

GET `/api/ski/all`

Every resort in one response, served from a single KV read. This is what the
tracker page should use. Returns 503 if the cache has never been populated.

GET `/api/ski/forecast/:id`

One resort. Falls back to a live NWS fetch on a cache miss.

GET `/api/ski/resorts`

The static resort list.

POST `/api/ski/refresh` (requires auth)

Forces a refresh of all resorts. Use after a deploy so the cache is warm
without waiting for the next scheduled run.

### Response contract

`snow24h`, `snow48h` and `links.nwsPage` are read directly by
`MichiganSkiTracker.tsx` on the frontend. Renaming any of them breaks the live
table. `test/contract.spec.ts` pins them; if that suite fails, update the
frontend before changing the API.

Additive fields, safe to extend: `tempMaxF`, `tempMinF`, `windMph`,
`windGustMph`, `rainRisk`, `thawRisk`.

### How it works

Each resort costs two outbound calls: the NWS raw gridpoint endpoint
(`/gridpoints/{office}/{x},{y}`), which returns numeric time series rather than
the English prose the `/forecast` variants give, and the NOHRSC snow analysis
for natural snow depth at that coordinate.

**The cron is split by region, and that split is load-bearing.** A Worker on
Cloudflare's free plan may make only 50 external subrequests per invocation.
41 resorts at two calls each is 82, so a single run silently loses everything
past the 25th resort. One cron entry per region keeps the largest run
(Northern LP, 15 resorts) at 30 subrequests. The cron's minute field selects
the region; see the scheduled handler in `src/index.ts`.

Each run merges its results into `forecast:all` rather than replacing it, so a
partial failure leaves the previous values in place and the stored set can only
be topped up, never truncated.

Snowfall is summed over real time intervals, prorating any interval that
straddles the window edge. Density comes from dividing forecast snowfall by
forecast liquid equivalent, which is the snow-to-liquid ratio, computed only
above the totals where NWS quantization stops distorting it. Parsing lives in
`src/noaa/gridpoint.ts`, the tier rules in `services/forecast/verdict.ts` and
the sentence templates in `services/forecast/story.ts`, all pure and unit
tested.

Past-window change comes from our own depth history in KV, because no NOAA
product serves past snowfall at a point in a format a Worker can read. It needs
about a day of runs before 24h deltas appear and two before 48h.

Grid references are stored per resort in `src/data/michiganResorts.ts`, so no
`/points` lookup happens at refresh time. After adding a resort, run:

    npm run seed:grids

### Manual refresh

One region per call, for the same subrequest reason:

    POST /api/ski/refresh?region=western-up

Valid slugs: `western-up`, `eastern-up`, `northern-lp`, `southern-lp`.
Requires a bearer token from `POST /api/login`.

### Deploying

`wrangler deploy` ships the working directory, not the last commit. Commit
before deploying, or the repo and production drift apart silently. That has
happened once already.

## Running Locally

`wrangler dev`

## Deploying

`wrangler deploy`
