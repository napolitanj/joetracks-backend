import { getResortsByRegion, type Region } from './getResortsByRegion';
import { getFreshForecast } from './singleForecast';
import type { Env } from '../../types/env';

export async function refreshAllForecasts(env: Env, region: Region) {
  const resorts = getResortsByRegion(region);

  console.log(`🔄 Refreshing region "${region}" (count=${resorts.length})`);

  for (const resort of resorts) {
    const key = `forecast:${resort.id}`;

    try {
      const fresh = await getFreshForecast(resort);

      const stamped = {
        ...fresh,
        _lastUpdated: Date.now(),
      };

      // No TTL – keep until next cron overwrite
      await env.WEATHER_CACHE.put(key, JSON.stringify(stamped));

      console.log(`✔ Updated ${resort.id}`);
    } catch (err) {
      console.log(`❌ Failed to refresh ${resort.id}`, err);
    }
  }

  console.log(`🎉 Region "${region}" refreshed`);
}
