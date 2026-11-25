import type { ResortConditions } from '../../noaa/gridpoint';
import type { GridRef } from '../../noaa/noaa';
import type { Resort } from '../../data/michiganResorts';
import type { Tier, SnowpackTrend } from './verdict';

type NormalizeInput = {
	resort: Resort;
	grid: GridRef;
	conditions: ResortConditions;
	snowpackTrend: SnowpackTrend | null;
	modelDepthIn: number | null;
	depthChange48h: number | null;
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
 *
 * NOTE ON SNOW DEPTH. There is no public base-depth field, and adding one back
 * needs a better data source than we have. The NOHRSC SNODAS model is 1km and
 * checked against ground observations it is wrong by multiples in both
 * directions. The raw figures stay on this object under underscore-prefixed
 * keys so the pipeline can be debugged, and the only depth signal anything is
 * meant to display is snowpackTrend, which is a direction and not a quantity.
 */
export function normalizeForecast(input: NormalizeInput) {
	const { resort, grid, conditions, snowpackTrend, modelDepthIn, depthChange48h, tier, story, updateTime } = input;

	return {
		resort,
		grid,

		// Contract: read by the frontend table.
		snow24h: conditions.snow24h,
		snow48h: conditions.snow48h,

		// The verdict and its sentence.
		tier,
		story,

		// Direction of change in the modelled snowpack. Never a figure.
		snowpackTrend,

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

		// Diagnostics. Not for display: see the note above.
		_modelSnowDepthIn: modelDepthIn,
		_modelDepthChange48h: depthChange48h,
		_source: 'NWS gridpoint; snowpack trend from NOHRSC SNODAS',
		_forecastIssued: updateTime,
	};
}
