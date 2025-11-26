import { RESORTS } from '../data/michiganResorts';
import { getFreshForecast } from '../services/forecast/singleForecast';
import type { Env } from '../types/env';

export async function refreshAllForecasts(env: Env) {
	console.log('Refreshing ALL resort forecasts…');

	for (const resort of RESORTS) {
		try {
			const data = await getFreshForecast(resort);

			await env.WEATHER_CACHE.put(`forecast:${resort.id}`, JSON.stringify(data), {
				expirationTtl: 60 * 60 * 12,
			});

			console.log('✔ updated', resort.id);
		} catch (err) {
			console.error('❌ failed', resort.id, err);
		}
	}

	console.log('Done.');
}
