import { Hono } from 'hono';
import { RESORTS } from '../data/michiganResorts';
import { getFreshForecast } from '../services/forecast/singleForecast';
import { FORECAST_TTL_SECONDS } from '../services/forecast/refreshAll';
import type { Env } from '../types/env';

export const ski = new Hono<{ Bindings: Env }>();

/**
 * Every resort in one response, served from a single KV read.
 *
 * The tracker page should use this. Requesting each resort separately costs
 * 42 round trips for a table that renders all at once.
 */
ski.get('/all', async (c) => {
	const cached = await c.env.WEATHER_CACHE.get('forecast:all');

	if (cached) return c.json(JSON.parse(cached));

	// Nothing cached yet, which means the cron has not run since the cache was
	// emptied. Report it rather than firing 42 live NWS calls on a page load.
	return c.json({ resorts: {}, _lastUpdated: null, error: 'No cached forecast yet' }, 503);
});

ski.get('/resorts', (c) => c.json(RESORTS));

ski.get('/forecast/:id', async (c) => {
	const id = c.req.param('id');
	const resort = RESORTS.find((r) => r.id === id);

	if (!resort) return c.json({ error: 'Not found' }, 404);

	const key = `forecast:${id}`;
	const cached = await c.env.WEATHER_CACHE.get(key);

	if (cached) return c.json(JSON.parse(cached));

	const fresh = await getFreshForecast(resort);
	const stamped = { ...fresh, _lastUpdated: Date.now() };

	await c.env.WEATHER_CACHE.put(key, JSON.stringify(stamped), {
		expirationTtl: FORECAST_TTL_SECONDS,
	});

	return c.json(stamped);
});
