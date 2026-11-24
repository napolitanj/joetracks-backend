/**
 * Pure helpers for reading NWS raw gridpoint data.
 *
 * The gridpoint endpoint (https://api.weather.gov/gridpoints/{office}/{x},{y})
 * returns one time series per weather element. Every series looks like:
 *
 *   { uom: "wmoUnit:mm", values: [ { validTime: "2026-11-24T12:00:00+00:00/PT6H", value: 25.4 } ] }
 *
 * validTime is an ISO 8601 interval: a start instant, a slash, then a duration.
 * Durations are irregular. A single series mixes PT1H, PT6H, PT13H and
 * multi-day forms like P1DT6H, so the duration has to be parsed, not assumed.
 *
 * Units are metric and vary by element:
 *   snowfallAmount, quantitativePrecipitation, iceAccumulation -> mm
 *   temperature, maxTemperature, minTemperature                -> degC
 *   windSpeed, windGust                                        -> km/h
 *
 * Nothing here performs I/O, so it is all directly testable.
 */

export type GridValue = { validTime: string; value: number | null };
export type GridSeries = { uom?: string; values?: GridValue[] } | undefined;

const HOUR_MS = 3_600_000;

/** Convert an ISO 8601 duration (P1DT6H, PT6H, P2D, PT30M) to hours. */
export function parseDurationHours(duration: string): number {
	const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration);
	if (!match) return 0;

	const days = Number(match[1] ?? 0);
	const hours = Number(match[2] ?? 0);
	const minutes = Number(match[3] ?? 0);

	return days * 24 + hours + minutes / 60;
}

/** Split "2026-11-24T12:00:00+00:00/PT6H" into absolute start and end in ms. */
export function intervalBounds(validTime: string): { start: number; end: number } | null {
	const slash = validTime.lastIndexOf('/');
	if (slash === -1) return null;

	const start = Date.parse(validTime.slice(0, slash));
	const hours = parseDurationHours(validTime.slice(slash + 1));

	if (!Number.isFinite(start) || hours <= 0) return null;

	return { start, end: start + hours * HOUR_MS };
}

/**
 * Sum an accumulating series (snowfall, precipitation, ice) across a window.
 *
 * Intervals routinely straddle the window edge. A 6-hour block starting two
 * hours before the window closes contributes two hours of its total, not all
 * six and not none, so overlapping intervals are prorated by the fraction of
 * their span that falls inside the window.
 */
export function sumOverWindow(series: GridSeries, windowStart: number, windowEnd: number): number {
	const values = series?.values;
	if (!values?.length) return 0;

	let total = 0;

	for (const entry of values) {
		if (entry?.value == null) continue;

		const bounds = intervalBounds(entry.validTime);
		if (!bounds) continue;

		const overlap = Math.min(bounds.end, windowEnd) - Math.max(bounds.start, windowStart);
		if (overlap <= 0) continue;

		total += entry.value * (overlap / (bounds.end - bounds.start));
	}

	return total;
}

/** Highest and lowest value of a series touching the window, or null if none do. */
export function extremesOverWindow(series: GridSeries, windowStart: number, windowEnd: number): { max: number | null; min: number | null } {
	const values = series?.values;
	let max: number | null = null;
	let min: number | null = null;

	if (!values?.length) return { max, min };

	for (const entry of values) {
		if (entry?.value == null) continue;

		const bounds = intervalBounds(entry.validTime);
		if (!bounds) continue;
		if (bounds.end <= windowStart || bounds.start >= windowEnd) continue;

		if (max === null || entry.value > max) max = entry.value;
		if (min === null || entry.value < min) min = entry.value;
	}

	return { max, min };
}

/**
 * Does any precipitation in the window fall as liquid?
 *
 * quantitativePrecipitation is liquid-equivalent and already includes melted
 * snow and ice, so precipitation with no matching snowfall or ice accumulation
 * over the same interval is rain. That is the distinction that matters in
 * Michigan, where a single rain-on-snow event undoes a week of base.
 */
export function hasLiquidPrecip(props: Record<string, GridSeries>, windowStart: number, windowEnd: number): boolean {
	const qpf = props.quantitativePrecipitation?.values;
	if (!qpf?.length) return false;

	for (const entry of qpf) {
		if (!entry?.value) continue;

		const bounds = intervalBounds(entry.validTime);
		if (!bounds) continue;
		if (bounds.end <= windowStart || bounds.start >= windowEnd) continue;

		const snow = sumOverWindow(props.snowfallAmount, bounds.start, bounds.end);
		const ice = sumOverWindow(props.iceAccumulation, bounds.start, bounds.end);

		// Frozen precipitation accounts for this interval, so nothing fell as rain.
		if (snow > 0.1 || ice > 0.1) continue;

		return true;
	}

	return false;
}

/**
 * Snow-to-liquid ratio: how fluffy the forecast snow is.
 *
 * snowfallAmount and quantitativePrecipitation are forecast on the same
 * intervals, and QPF is liquid-equivalent, so their quotient is the density
 * NWS is actually predicting. Around 10:1 is average; 18:1 is cold and dry;
 * under 5:1 means most of that water is not arriving as snow at all, which
 * catches sleet and changeover events that a temperature check alone misses.
 *
 * NWS quantizes QPF to hundredths of an inch, so at small totals the quotient
 * is arithmetic noise rather than meteorology. Below these floors we return
 * null and say nothing about density, rather than guessing.
 */
const SLR_MIN_LIQUID_MM = 2.5; // 0.10 inches
const SLR_MIN_SNOW_MM = 25.4; // 1 inch

export function snowToLiquidRatio(properties: Record<string, GridSeries>, windowStart: number, windowEnd: number): number | null {
	const snow = sumOverWindow(properties.snowfallAmount, windowStart, windowEnd);
	const liquid = sumOverWindow(properties.quantitativePrecipitation, windowStart, windowEnd);

	if (liquid < SLR_MIN_LIQUID_MM || snow < SLR_MIN_SNOW_MM) return null;

	return Math.round((snow / liquid) * 10) / 10;
}

export const mmToInches = (mm: number) => mm / 25.4;
export const celsiusToF = (c: number) => (c * 9) / 5 + 32;
export const kmhToMph = (kmh: number) => kmh / 1.609344;

const round = (n: number, places = 1) => {
	const factor = 10 ** places;
	return Math.round(n * factor) / factor;
};

/** Round, or pass null through rather than turning a missing reading into zero. */
const roundOrNull = (n: number | null, convert: (v: number) => number) => (n === null ? null : Math.round(convert(n)));

export type ResortConditions = {
	snow24h: number;
	snow48h: number;
	tempMaxF: number | null;
	tempMinF: number | null;
	windMph: number | null;
	windGustMph: number | null;
	rainRisk: boolean;
	thawRisk: boolean;
	/** Snow-to-liquid ratio over the next 48h, or null when too little falls to tell. */
	snowRatio: number | null;
};

/**
 * Reduce a full gridpoint response to the handful of numbers the tracker shows.
 *
 * Windows run forward from `now` rather than from the forecast's issue time,
 * which can be several hours stale by the time anyone loads the page.
 *
 * snow48h is cumulative and includes snow24h, because that is how a skier
 * reads "48 hour snow" and how the table's alert thresholds are written.
 */
export function extractConditions(properties: Record<string, GridSeries>, now: number = Date.now()): ResortConditions {
	const end24 = now + 24 * HOUR_MS;
	const end48 = now + 48 * HOUR_MS;

	const snow24mm = sumOverWindow(properties.snowfallAmount, now, end24);
	const snow48mm = sumOverWindow(properties.snowfallAmount, now, end48);

	const temps = extremesOverWindow(properties.temperature, now, end48);
	const wind = extremesOverWindow(properties.windSpeed, now, end48);
	const gust = extremesOverWindow(properties.windGust, now, end48);

	// 1.1 C is about 34 F: close enough to freezing that the surface turns soft.
	const thawRisk = temps.max !== null && temps.max > 1.1;

	return {
		snow24h: round(mmToInches(snow24mm)),
		snow48h: round(mmToInches(snow48mm)),
		tempMaxF: roundOrNull(temps.max, celsiusToF),
		tempMinF: roundOrNull(temps.min, celsiusToF),
		windMph: roundOrNull(wind.max, kmhToMph),
		windGustMph: roundOrNull(gust.max, kmhToMph),
		rainRisk: hasLiquidPrecip(properties, now, end48),
		thawRisk,
		snowRatio: snowToLiquidRatio(properties, now, end48),
	};
}
