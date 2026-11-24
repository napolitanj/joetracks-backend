import { getGridpointData, getNOAAGridpoint, type GridRef } from '../../noaa/noaa';
import { extractConditions } from '../../noaa/gridpoint';
import { normalizeForecast } from './normalize';
import type { Resort } from '../../data/michiganResorts';

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

export async function getFreshForecast(resort: Resort) {
	const grid = await resolveGrid(resort);
	const properties = await getGridpointData(grid);
	const conditions = extractConditions(properties);

	return normalizeForecast({ resort, grid, conditions, updateTime: properties.updateTime ?? null });
}
