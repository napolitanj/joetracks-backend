import { getGridpointData, getNOAAGridpoint, type GridRef } from '../../noaa/noaa';
import { extractConditions } from '../../noaa/gridpoint';
import { getNaturalSnowDepthInches } from '../../noaa/snowdepth';
import { depthChange, type DepthReading } from './history';
import { decideTier } from './verdict';
import { buildStory } from './story';
import { normalizeForecast } from './normalize';
import type { Resort } from '../../data/michiganResorts';

type ForecastOptions = {
	/** Past depth readings for this resort, oldest first. */
	history?: DepthReading[];
	now?: number;
};

/**
 * Resolve a resort's grid cell, preferring the value stored alongside the
 * resort. Falling back to a live lookup keeps a newly added resort working
 * before anyone runs the seed script.
 */
async function resolveGrid(resort: Resort): Promise<GridRef> {
	if (resort.gridId && resort.gridX != null && resort.gridY != null) {
		return { gridId: resort.gridId, gridX: resort.gridX, gridY: resort.gridY };
	}

	return await getNOAAGridpoint(resort.lat, resort.lon);
}

export async function getFreshForecast(resort: Resort, options: ForecastOptions = {}) {
	const now = options.now ?? Date.now();
	const grid = await resolveGrid(resort);

	// Snow depth is a nice-to-have. If NOHRSC is down the forecast still works,
	// the story just loses its base clause.
	const [properties, naturalBaseInches] = await Promise.all([
		getGridpointData(grid),
		getNaturalSnowDepthInches(resort.lat, resort.lon).catch((err) => {
			console.error(`Snow depth lookup failed for ${resort.id}:`, err);
			return null;
		}),
	]);

	const conditions = extractConditions(properties, now);

	// Deltas are measured against today's reading, so it has to be in the series.
	const series = naturalBaseInches === null ? (options.history ?? []) : [...(options.history ?? []), { t: now, d: naturalBaseInches }];

	const past24h = depthChange(series, 24, now);
	const past48h = depthChange(series, 48, now);

	const tier = decideTier({
		snow48h: conditions.snow48h,
		tempMaxF: conditions.tempMaxF,
		windGustMph: conditions.windGustMph,
		rainRisk: conditions.rainRisk,
		thawRisk: conditions.thawRisk,
		snowRatio: conditions.snowRatio,
		naturalBaseInches,
	});

	const story = buildStory({
		resortId: resort.id,
		tier,
		snow24h: conditions.snow24h,
		snow48h: conditions.snow48h,
		past48h,
		naturalBaseInches,
		tempMaxF: conditions.tempMaxF,
		windGustMph: conditions.windGustMph,
		snowRatio: conditions.snowRatio,
	});

	return normalizeForecast({
		resort,
		grid,
		conditions,
		naturalBaseInches,
		past24h,
		past48h,
		tier,
		story,
		updateTime: properties.updateTime ?? null,
	});
}
