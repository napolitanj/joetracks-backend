import { RESORTS } from '../../data/michiganResorts';
import { getFreshForecast } from './singleForecast';

import type { Env } from '../../types/env';

export async function refreshAllForecasts(env: Env) {
	console.log('🔄 Refreshing ALL ski forecasts...');

	for (const resort of RESORTS) {
		const key = `forecast:${resort.id}`;

		try {
			const fresh = await getFreshForecast(resort);

			const stamped = {
				...fresh,
				_lastUpdated: Date.now(),
			};

			await env.WEATHER_CACHE.put(key, JSON.stringify(stamped));


			console.log(`✔ Updated ${resort.id}`);
		} catch (err) {
			console.log(`❌ Failed to refresh ${resort.id}`, err);
		}
	}

	console.log('🎉 All forecasts refreshed');
}
