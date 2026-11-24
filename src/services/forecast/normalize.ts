import type { ResortConditions } from '../../noaa/gridpoint';
import type { GridRef } from '../../noaa/noaa';
import type { Resort } from '../../data/michiganResorts';
import type { Tier } from './verdict';

type NormalizeInput = {
	resort: Resort;
	grid: GridRef;
	conditions: ResortConditions;
	naturalBaseInches: number | null;
	past24h: number | null;
	past48h: number | null;
	tier: Tier;
	story: string;
	updateTime: string | null;
};

/**
 * Shape the public API response.
 *
 * snow24h, snow48h and links.nwsPage are read directly by the Michigan Ski
 * Tracker page. Renaming any of them breaks the live table, so the contract
 * test in test/contract.spec.ts pins them.
 *
 * tier and story are decided here rather than on the page on purpose: the
 * thresholds are editorial, they belong under test, and the newsletter should
 * be able to read the same sentence the site shows.
 */
export function normalizeForecast(input: NormalizeInput) {
	const { resort, grid, conditions, naturalBaseInches, past24h, past48h, tier, story, updateTime } = input;

	return {
		resort,
		grid,

		// Contract: read by the frontend table.
		snow24h: conditions.snow24h,
		snow48h: conditions.snow48h,

		// The verdict and its sentence.
		tier,
		story,

		// What is already on the ground. NATURAL snow only: the model knows
		// nothing about snowmaking, so this reads far lower than a groomed
		// resort's reported base. Label it as natural wherever it is shown.
		naturalBaseInches,
		past24h,
		past48h,

		tempMaxF: conditions.tempMaxF,
		tempMinF: conditions.tempMinF,
		windMph: conditions.windMph,
		windGustMph: conditions.windGustMph,
		snowRatio: conditions.snowRatio,
		rainRisk: conditions.rainRisk,
		thawRisk: conditions.thawRisk,

		links: {
			nwsPage: `https://forecast.weather.gov/MapClick.php?lat=${resort.lat}&lon=${resort.lon}`,
			forecast: `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}/forecast`,
			hourly: `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}/forecast/hourly`,
		},

		_source: 'NWS gridpoint + NOHRSC snow analysis',
		_forecastIssued: updateTime,
	};
}
