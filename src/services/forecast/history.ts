/**
 * Rolling record of natural snow depth, so the tracker can say what changed.
 *
 * No NOAA product gives past snowfall at a point in a form a Worker can read:
 * the gridded snowfall analysis ships only as NetCDF, GeoTIFF and GRIB2. So we
 * build the history ourselves, one reading per refresh.
 *
 * Depth change is arguably the better number anyway. If eight inches fell and
 * then it rained, "snowfall: 8 inches" is a lie and "base dropped two inches"
 * is the truth. Settling and melt are part of the answer, not noise in it.
 *
 * Everything here except load and save is pure, so the window matching is
 * directly testable.
 */

import type { Env } from '../../types/env';

export type DepthReading = { t: number; d: number };
export type DepthHistory = Record<string, DepthReading[]>;

const KEY = 'depth:history';

/** Four days at two refreshes a day, enough for a 48h delta with slack. */
const MAX_READINGS = 8;

/**
 * How far from the target a reading may sit and still count.
 *
 * Refreshes are twelve hours apart, so a 24h lookback lands on a real reading.
 * Eight hours of slack absorbs a missed or delayed run without silently
 * comparing against the wrong day.
 */
const MATCH_TOLERANCE_MS = 8 * 3_600_000;

export async function loadDepthHistory(env: Pick<Env, 'WEATHER_CACHE'>): Promise<DepthHistory> {
	try {
		const raw = await env.WEATHER_CACHE.get(KEY);
		if (!raw) return {};

		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch (err) {
		console.error('Could not read depth history, starting fresh:', err);
		return {};
	}
}

export async function saveDepthHistory(env: Pick<Env, 'WEATHER_CACHE'>, history: DepthHistory): Promise<void> {
	// No TTL. This is the one thing in the cache that must not expire, since
	// losing it costs two days before deltas come back.
	await env.WEATHER_CACHE.put(KEY, JSON.stringify(history));
}

/** Append this run's readings and drop anything past the retention window. */
export function recordDepths(history: DepthHistory, readings: Record<string, number | null>, now: number): DepthHistory {
	const next: DepthHistory = { ...history };

	for (const [id, depth] of Object.entries(readings)) {
		if (depth == null) continue;

		const entries = [...(next[id] ?? []), { t: now, d: depth }];
		entries.sort((a, b) => a.t - b.t);
		next[id] = entries.slice(-MAX_READINGS);
	}

	return next;
}

/**
 * Change in depth over the last `hoursAgo` hours, or null when there is no
 * reading close enough to that point to compare against.
 *
 * Returning null rather than zero matters: "no data yet" and "no change" are
 * different answers, and the story templates word them differently.
 */
export function depthChange(entries: DepthReading[] | undefined, hoursAgo: number, now: number): number | null {
	if (!entries?.length) return null;

	const latest = entries[entries.length - 1];

	// A stale latest reading means the refresh has not run recently; comparing
	// against it would report a change that did not happen in the stated window.
	if (now - latest.t > MATCH_TOLERANCE_MS) return null;

	const target = latest.t - hoursAgo * 3_600_000;

	let best: DepthReading | null = null;
	let bestGap = Infinity;

	for (const entry of entries) {
		if (entry === latest) continue;

		const gap = Math.abs(entry.t - target);
		if (gap < bestGap) {
			bestGap = gap;
			best = entry;
		}
	}

	if (!best || bestGap > MATCH_TOLERANCE_MS) return null;

	return Math.round((latest.d - best.d) * 10) / 10;
}
