import type { ResortConditions } from '../../noaa/gridpoint';
import type { GridRef } from '../../noaa/noaa';
import type { Resort } from '../../data/michiganResorts';

type NormalizeInput = {
	resort: Resort;
	grid: GridRef;
	conditions: ResortConditions;
	updateTime: string | null;
};

/**
 * Shape the public API response.
 *
 * snow24h, snow48h and links.nwsPage are read directly by the Michigan Ski
 * Tracker page. Renaming any of them breaks the live table, so the contract
 * test in test/contract.spec.ts pins them.
 *
 * Everything below those is additive and safe to extend.
 */
export function normalizeForecast(input: NormalizeInput) {
	const { resort, grid, conditions, updateTime } = input;

	return {
		resort,
		grid,

		// Contract: read by the frontend table.
		snow24h: conditions.snow24h,
		snow48h: conditions.snow48h,

		// Additive: available to the frontend whenever it wants them.
		tempMaxF: conditions.tempMaxF,
		tempMinF: conditions.tempMinF,
		windMph: conditions.windMph,
		windGustMph: conditions.windGustMph,
		rainRisk: conditions.rainRisk,
		thawRisk: conditions.thawRisk,

		links: {
			nwsPage: `https://forecast.weather.gov/MapClick.php?lat=${resort.lat}&lon=${resort.lon}`,
			forecast: `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}/forecast`,
			hourly: `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}/forecast/hourly`,
		},

		_source: 'NWS gridpoint',
		_forecastIssued: updateTime,
	};
}
