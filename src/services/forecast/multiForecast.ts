import { RESORTS } from '../../data/michiganResorts';
import type { Env } from '../../types/env';

export async function getMultiForecast(env: Env) {
  const result: Record<string, any> = {};

  for (const resort of RESORTS) {
    const key = `forecast:${resort.id}`;

    const cached = await env.WEATHER_CACHE.get(key, 'json');

    if (cached) {
      result[resort.id] = cached;
    } else {
      // Fallback if cron hasn’t run yet for some reason
      result[resort.id] = {
        resort,
        snow24h: 0,
        snow72h: 0,
        _lastUpdated: null,
      };
    }
  }

  return result;
}
