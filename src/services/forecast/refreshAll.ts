import { RESORTS } from '../../data/michiganResorts';
import { getFreshForecast } from './singleForecast';
import { loadDepthHistory, saveDepthHistory, recordDepths } from './history';
import { buildSummary, type SummaryResort } from './story';
import type { Env } from '../../types/env';

/**
 * Refreshing one region at a time, and why.
 *
 * Each resort costs two outbound calls: the NWS gridpoint forecast and the
 * NOHRSC snow depth. Cloudflare caps a Worker on the free plan at 50 external
 * subrequests per invocation, so all 41 resorts in one run is 82 and the back
 * half of the list simply fails.
 *
 * Splitting by region keeps the largest run (Northern LP, 15 resorts) at 30
 * subrequests. The cron fires once per region per refresh window, staggered
 * five minutes apart, and each run merges its results into the combined
 * payload rather than replacing it.
 *
 * Merging is also what makes a partial failure safe. A run that loses half its
 * resorts leaves the previous values in place for those, so the stored set can
 * only ever be topped up, never truncated.
 */

export const REGIONS = ['Western UP', 'Eastern UP', 'Northern LP', 'Southern LP'] as const;
export type Region = (typeof REGIONS)[number];

/** URL-friendly names for the manual refresh route. */
export const REGION_SLUGS: Record<string, Region> = {
	'western-up': 'Western UP',
	'eastern-up': 'Eastern UP',
	'northern-lp': 'Northern LP',
	'southern-lp': 'Southern LP',
};

/**
 * Cache lifetime for a stored forecast.
 *
 * Longer than the gap between runs on purpose. If a refresh fails or an
 * upstream API is down, the page keeps showing the previous forecast with its
 * own timestamp rather than an empty table. Stale and labelled beats blank.
 */
export const FORECAST_TTL_SECONDS = 60 * 60 * 26;

/** Resorts fetched at once. Well inside the per-invocation subrequest cap. */
const BATCH_SIZE = 8;

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

type CombinedPayload = {
	resorts: Record<string, any>;
	summary?: string;
	_lastUpdated?: number;
};

async function readCombined(env: Env): Promise<CombinedPayload> {
	try {
		const raw = await env.WEATHER_CACHE.get('forecast:all');
		if (!raw) return { resorts: {} };

		const parsed = JSON.parse(raw);
		return parsed?.resorts ? parsed : { resorts: {} };
	} catch (err) {
		console.error('Could not read forecast:all, starting from empty:', err);
		return { resorts: {} };
	}
}

function toSummaryRow(data: any): SummaryResort {
	return {
		name: data.resort.name,
		region: data.resort.region,
		tier: data.tier,
		snow48h: data.snow48h,
	};
}

export async function refreshRegion(env: Env, region: Region) {
	const startedAt = Date.now();
	const resorts = RESORTS.filter((r) => r.region === region);

	if (!resorts.length) {
		console.error(`No resorts in region ${region}`);
		return { region, succeeded: 0, failed: 0 };
	}

	const history = await loadDepthHistory(env);
	const fresh: Record<string, any> = {};
	const depthsThisRun: Record<string, number | null> = {};
	let succeeded = 0;
	let failed = 0;

	for (const batch of chunk(resorts, BATCH_SIZE)) {
		const results = await Promise.all(
			batch.map(async (resort) => {
				try {
					const data = await getFreshForecast(resort, { history: history[resort.id], now: startedAt });
					return { id: resort.id, data: { ...data, _lastUpdated: Date.now() } };
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
			fresh[id] = data;
			depthsThisRun[id] = data._modelSnowDepthIn;

			await env.WEATHER_CACHE.put(`forecast:${id}`, JSON.stringify(data), {
				expirationTtl: FORECAST_TTL_SECONDS,
			});
		}
	}

	// Merge, never replace. Resorts outside this region, and any inside it that
	// failed, keep whatever was already stored.
	const combined = await readCombined(env);
	const merged = { ...combined.resorts, ...fresh };

	// The summary speaks for the whole state, so it is built from everything we
	// hold, not just the region that happened to refresh.
	const summaryRows = Object.values(merged)
		.filter((d: any) => d?.resort && d?.tier)
		.map(toSummaryRow);

	await env.WEATHER_CACHE.put(
		'forecast:all',
		JSON.stringify({
			resorts: merged,
			summary: summaryRows.length ? buildSummary(summaryRows) : undefined,
			_lastUpdated: Date.now(),
		}),
		{ expirationTtl: FORECAST_TTL_SECONDS },
	);

	if (succeeded > 0) {
		await saveDepthHistory(env, recordDepths(history, depthsThisRun, startedAt));
	}

	console.log(
		`${region}: refreshed ${succeeded}/${resorts.length} in ${Date.now() - startedAt}ms ` +
			`(${failed} failed, ${Object.keys(merged).length} resorts stored)`,
	);

	return { region, succeeded, failed, stored: Object.keys(merged).length };
}
