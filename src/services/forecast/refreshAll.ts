import { RESORTS } from '../../data/michiganResorts';
import { getFreshForecast } from './singleForecast';
import type { Env } from '../../types/env';

/**
 * Cache lifetime for a stored forecast.
 *
 * Longer than the gap between cron runs on purpose. If a refresh fails or the
 * NWS API is down, the page keeps showing the previous forecast with its own
 * timestamp rather than an empty table. Stale and labelled beats blank.
 */
export const FORECAST_TTL_SECONDS = 60 * 60 * 26;

/** How many resorts to fetch at once. Enough to finish quickly, polite to NWS. */
const BATCH_SIZE = 8;

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/**
 * Refresh every resort forecast and write it to KV.
 *
 * Writes each resort under its own key, and the whole set under forecast:all
 * so the tracker page can load in a single request instead of 42.
 */
export async function refreshAllForecasts(env: Env) {
	const startedAt = Date.now();
	const combined: Record<string, unknown> = {};
	let succeeded = 0;
	let failed = 0;

	for (const batch of chunk(RESORTS, BATCH_SIZE)) {
		const results = await Promise.all(
			batch.map(async (resort) => {
				try {
					const fresh = await getFreshForecast(resort);
					return { id: resort.id, data: { ...fresh, _lastUpdated: Date.now() } };
				} catch (err) {
					console.error(`Failed to refresh ${resort.id}:`, err);
					return { id: resort.id, data: null };
				}
			}),
		);

		for (const { id, data } of results) {
			if (!data) {
				failed++;
				continue;
			}

			succeeded++;
			combined[id] = data;
			await env.WEATHER_CACHE.put(`forecast:${id}`, JSON.stringify(data), {
				expirationTtl: FORECAST_TTL_SECONDS,
			});
		}
	}

	// Only replace the combined payload if most of the run worked. A mostly
	// failed refresh should not wipe out a good one already in the cache.
	if (succeeded > RESORTS.length / 2) {
		await env.WEATHER_CACHE.put('forecast:all', JSON.stringify({ resorts: combined, _lastUpdated: Date.now() }), {
			expirationTtl: FORECAST_TTL_SECONDS,
		});
	} else {
		console.error(`Refresh kept previous forecast:all — only ${succeeded}/${RESORTS.length} resorts succeeded`);
	}

	console.log(`Refreshed ${succeeded}/${RESORTS.length} resorts in ${Date.now() - startedAt}ms (${failed} failed)`);

	return { succeeded, failed };
}
