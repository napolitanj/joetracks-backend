import { Hono } from 'hono';
import { RESORTS } from '../data/michiganResorts';
import { getFreshForecast } from '../services/forecast/singleForecast';
import { getMultiForecast } from '../services/forecast/multiForecast';

import type { Env } from '../types/env';

export const ski = new Hono<{ Bindings: Env }>();


// ------------------------------------------------------
// PUBLIC ENDPOINT — USES CACHE ONLY
// ------------------------------------------------------
ski.get('/forecast/:id', async (c) => {
  const id = c.req.param('id');
  const resort = RESORTS.find((r) => r.id === id);

  if (!resort) return c.json({ error: 'Not found' }, 404);

  const key = `forecast:${id}`;

  const cached = await c.env.WEATHER_CACHE.get(key, 'json');
  if (cached) return c.json(cached);

  return c.json({
    resort,
    snow24h: 0,
    snow72h: 0,
    _lastUpdated: null,
    note: 'Cache not populated yet',
  });
});


// ------------------------------------------------------
// PUBLIC ENDPOINT — MULTI FORECAST FROM CACHE ONLY
// ------------------------------------------------------
ski.get('/multi', async (c) => {
  const all = await getMultiForecast(c.env);
  return c.json(all);
});


// ------------------------------------------------------
// DEBUG ENDPOINT — OPTIONAL NOAA FETCHER
// REMOVE IN PRODUCTION
// ------------------------------------------------------
ski.get('/debug/fresh/:id', async (c) => {
  const id = c.req.param('id');
  const resort = RESORTS.find((r) => r.id === id);

  if (!resort) return c.json({ error: 'Not found' }, 404);

  const fresh = await getFreshForecast(resort);

  return c.json({
    ...fresh,
    _debug: true,
    _lastUpdated: Date.now(),
  });
});
