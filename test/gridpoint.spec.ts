import { describe, it, expect } from 'vitest';
import {
	parseDurationHours,
	intervalBounds,
	sumOverWindow,
	extremesOverWindow,
	hasLiquidPrecip,
	extractConditions,
} from '../src/noaa/gridpoint';

const T0 = Date.parse('2026-11-24T12:00:00+00:00');
const hours = (n: number) => n * 3_600_000;

/** Build a series entry starting `offset` hours after T0, lasting `span` hours. */
const at = (offset: number, span: number, value: number | null) => ({
	validTime: `${new Date(T0 + hours(offset)).toISOString().replace('.000Z', '+00:00')}/PT${span}H`,
	value,
});

describe('parseDurationHours', () => {
	it('reads plain hour durations', () => {
		expect(parseDurationHours('PT1H')).toBe(1);
		expect(parseDurationHours('PT6H')).toBe(6);
		expect(parseDurationHours('PT18H')).toBe(18);
	});

	it('reads day-and-hour durations, which the real API does return', () => {
		expect(parseDurationHours('P1DT6H')).toBe(30);
		expect(parseDurationHours('P2DT18H')).toBe(66);
		expect(parseDurationHours('P7DT16H')).toBe(184);
	});

	it('reads bare day durations and minutes', () => {
		expect(parseDurationHours('P2D')).toBe(48);
		expect(parseDurationHours('PT30M')).toBe(0.5);
	});

	it('returns 0 for anything it cannot parse, rather than guessing', () => {
		expect(parseDurationHours('banana')).toBe(0);
		expect(parseDurationHours('')).toBe(0);
	});
});

describe('intervalBounds', () => {
	it('splits an ISO interval into absolute start and end', () => {
		const b = intervalBounds('2026-11-24T12:00:00+00:00/PT6H');
		expect(b).not.toBeNull();
		expect(b!.start).toBe(T0);
		expect(b!.end).toBe(T0 + hours(6));
	});

	it('rejects malformed input', () => {
		expect(intervalBounds('2026-11-24T12:00:00+00:00')).toBeNull();
		expect(intervalBounds('nonsense/PT6H')).toBeNull();
	});
});

describe('sumOverWindow', () => {
	it('sums intervals that sit fully inside the window', () => {
		const series = { values: [at(0, 6, 10), at(6, 6, 15)] };
		expect(sumOverWindow(series, T0, T0 + hours(12))).toBe(25);
	});

	it('prorates an interval straddling the window edge', () => {
		// A 6-hour block of 12mm, with only 2 of its hours inside the window.
		const series = { values: [at(0, 6, 12)] };
		expect(sumOverWindow(series, T0, T0 + hours(2))).toBeCloseTo(4, 5);
	});

	it('ignores intervals entirely outside the window', () => {
		const series = { values: [at(48, 6, 99)] };
		expect(sumOverWindow(series, T0, T0 + hours(24))).toBe(0);
	});

	it('skips null readings instead of treating them as zero', () => {
		const series = { values: [at(0, 6, null), at(6, 6, 8)] };
		expect(sumOverWindow(series, T0, T0 + hours(12))).toBe(8);
	});

	it('returns 0 for a missing or empty series', () => {
		expect(sumOverWindow(undefined, T0, T0 + hours(24))).toBe(0);
		expect(sumOverWindow({ values: [] }, T0, T0 + hours(24))).toBe(0);
	});
});

describe('extremesOverWindow', () => {
	it('finds the high and low touching the window', () => {
		const series = { values: [at(0, 3, -5), at(3, 3, 2), at(6, 3, -1)] };
		expect(extremesOverWindow(series, T0, T0 + hours(9))).toEqual({ max: 2, min: -5 });
	});

	it('returns nulls when nothing overlaps', () => {
		expect(extremesOverWindow({ values: [at(48, 3, 5)] }, T0, T0 + hours(24))).toEqual({ max: null, min: null });
	});
});

describe('hasLiquidPrecip', () => {
	it('flags precipitation with no matching snow or ice', () => {
		const props = {
			quantitativePrecipitation: { values: [at(0, 6, 5)] },
			snowfallAmount: { values: [at(0, 6, 0)] },
			iceAccumulation: { values: [at(0, 6, 0)] },
		};
		expect(hasLiquidPrecip(props, T0, T0 + hours(24))).toBe(true);
	});

	it('does not flag precipitation that falls entirely as snow', () => {
		const props = {
			quantitativePrecipitation: { values: [at(0, 6, 5)] },
			snowfallAmount: { values: [at(0, 6, 50)] },
			iceAccumulation: { values: [at(0, 6, 0)] },
		};
		expect(hasLiquidPrecip(props, T0, T0 + hours(24))).toBe(false);
	});

	it('is false when no precipitation is forecast at all', () => {
		const props = {
			quantitativePrecipitation: { values: [at(0, 6, 0)] },
			snowfallAmount: { values: [at(0, 6, 0)] },
		};
		expect(hasLiquidPrecip(props, T0, T0 + hours(24))).toBe(false);
	});
});

describe('extractConditions', () => {
	const props = {
		// 25.4mm (1 inch) in the first 24h, another 50.8mm (2 inches) in the second.
		snowfallAmount: { values: [at(0, 6, 25.4), at(24, 6, 50.8)] },
		quantitativePrecipitation: { values: [at(0, 6, 2), at(24, 6, 4)] },
		iceAccumulation: { values: [at(0, 6, 0), at(24, 6, 0)] },
		temperature: { values: [at(0, 6, -8), at(24, 6, -2)] },
		windSpeed: { values: [at(0, 6, 16.09344)] },
		windGust: { values: [at(0, 6, 48.28032)] },
	};

	it('converts millimetres to inches', () => {
		const c = extractConditions(props, T0);
		expect(c.snow24h).toBe(1);
	});

	it('reports snow48h as cumulative, including the first 24 hours', () => {
		const c = extractConditions(props, T0);
		expect(c.snow48h).toBe(3);
		expect(c.snow48h).toBeGreaterThan(c.snow24h);
	});

	it('converts Celsius to Fahrenheit and km/h to mph', () => {
		const c = extractConditions(props, T0);
		expect(c.tempMaxF).toBe(28);
		expect(c.tempMinF).toBe(18);
		expect(c.windMph).toBe(10);
		expect(c.windGustMph).toBe(30);
	});

	it('does not flag rain when everything falls as snow', () => {
		expect(extractConditions(props, T0).rainRisk).toBe(false);
	});

	it('flags a thaw when the high crosses freezing', () => {
		const warm = { ...props, temperature: { values: [at(0, 6, -8), at(24, 6, 6)] } };
		expect(extractConditions(warm, T0).thawRisk).toBe(true);
		expect(extractConditions(props, T0).thawRisk).toBe(false);
	});

	it('returns zeroes and nulls for an empty gridpoint rather than throwing', () => {
		const c = extractConditions({}, T0);
		expect(c.snow24h).toBe(0);
		expect(c.snow48h).toBe(0);
		expect(c.tempMaxF).toBeNull();
		expect(c.windMph).toBeNull();
		expect(c.rainRisk).toBe(false);
	});
});
