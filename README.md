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

A cron runs twice daily (`0 10,22 * * *` UTC, which is 5am and 5pm Eastern)
and writes every resort to KV.

Each resort takes exactly one request to the NWS raw gridpoint endpoint
(`/gridpoints/{office}/{x},{y}`), which returns numeric time series rather
than the English prose the `/forecast` variants return. Snowfall is summed
over real time intervals, prorating any interval that straddles the window
edge. Parsing logic lives in `src/noaa/gridpoint.ts` and is pure, so it is
unit tested without the worker runtime.

Grid references are stored per resort in `src/data/michiganResorts.ts`, so no
`/points` lookup happens at refresh time. After adding a resort, run:

    npm run seed:grids

### Deploying

`wrangler deploy` ships the working directory, not the last commit. Commit
before deploying, or the repo and production drift apart silently. That has
happened once already.

## Running Locally

`wrangler dev`

## Deploying

`wrangler deploy`
