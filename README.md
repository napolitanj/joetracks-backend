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

Provides snowfall + forecast links for 40+ Michigan ski resorts.

### Endpoints

GET `/api/ski/forecast/:id`

Returns:

- 24h and 72h snow
- NOAA forecast link
- Gridpoint metadata

### Tech

- NOAA Points API
- NOAA Gridpoints API
- Optional NDFD integration

---

## Running Locally

`wrangler dev`

## Deploying

`wrangler deploy`
