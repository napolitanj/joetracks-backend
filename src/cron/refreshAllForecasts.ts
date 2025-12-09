import { RESORTS } from '../data/michiganResorts';
import { getFreshForecast } from '../services/forecast/singleForecast';
import type { Env } from '../types/env';

export async function refreshAllForecasts(env: Env) {
  console.log('🔄 Refreshing ALL resort forecasts…');

  for (const resort of RESORTS) {
    const key = `forecast:${resort.id}`;

    try {
      const fresh = await getFreshForecast(resort);

      const stamped = {
        ...fresh,
        _lastUpdated: Date.now(),
      };

      // No TTL – let cron overwrite on the next run
      await env.WEATHER_CACHE.put(key, JSON.stringify(stamped));

      console.log('✔ updated', resort.id);
    } catch (err) {
      console.error('❌ failed', resort.id, err);
    }
  }

  console.log('✅ Done refreshing all resorts.');
}
