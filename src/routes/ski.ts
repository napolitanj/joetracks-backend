import { Hono } from 'hono';
import { RESORTS } from '../data/michiganResorts';
import { getFreshForecast } from '../services/forecast/singleForecast';
import { getMultiForecast } from '../services/forecast/multiForecast';

import type { Env } from '../types/env';

export const ski = new Hono<{ Bindings: Env }>();

ski.get('/forecast/:id', async (c) => {
	const id = c.req.param('id');
	const resort = RESORTS.find((r) => r.id === id);

	if (!resort) return c.json({ error: 'Not found' }, 404);

	const key = `forecast:${id}`;

	// Try cache
	const cached = await c.env.WEATHER_CACHE.get(key);
	if (cached) return c.json(JSON.parse(cached));

	// Fresh fetch
	const fresh = await getFreshForecast(resort);

	const stamped = {
		...fresh,
		_lastUpdated: Date.now(),
	};

	await c.env.WEATHER_CACHE.put(key, JSON.stringify(stamped), {
		expirationTtl: 60 * 60, // 1 hour
	});

	return c.json(stamped);
});

ski.get('/multi', async (c) => {
	const all = await getMultiForecast();
	return c.json(all);
});
