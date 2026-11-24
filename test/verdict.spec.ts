import { describe, it, expect } from 'vitest';
import { decideTier, describeDensity, isWindHold, THIN_BASE_INCHES } from '../src/services/forecast/verdict';

const base = {
	snow48h: 0,
	tempMaxF: 25,
	windGustMph: 10,
	rainRisk: false,
	thawRisk: false,
	snowRatio: null as number | null,
	naturalBaseInches: 30 as number | null,
};
const t = (over: Partial<typeof base> = {}) => decideTier({ ...base, ...over });

describe('snow tier boundaries', () => {
	it('matches the thresholds exactly at each edge', () => {
		expect(t({ snow48h: 0 })).toBe('FIRM');
		expect(t({ snow48h: 0.9 })).toBe('FIRM');
		expect(t({ snow48h: 1 })).toBe('REFRESH');
		expect(t({ snow48h: 2.9 })).toBe('REFRESH');
		expect(t({ snow48h: 3 })).toBe('GOOD');
		expect(t({ snow48h: 6.9 })).toBe('GOOD');
		expect(t({ snow48h: 7 })).toBe('POWDER');
		expect(t({ snow48h: 14.9 })).toBe('POWDER');
		expect(t({ snow48h: 15 })).toBe('STORM');
		expect(t({ snow48h: 30 })).toBe('STORM');
	});
});

describe('rain overrides everything', () => {
	it('beats a storm-sized forecast', () => {
		expect(t({ snow48h: 20, rainRisk: true })).toBe('RAIN');
	});

	it('fires on a low snow-to-liquid ratio even when temperature looks fine', () => {
		// The Mt Washington case: 25F, below freezing, but the ratio says the
		// water is not arriving as snow.
		expect(t({ snow48h: 8, tempMaxF: 25, snowRatio: 1.6 })).toBe('RAIN');
	});

	it('does not fire on a normal or light ratio', () => {
		expect(t({ snow48h: 8, snowRatio: 10 })).toBe('POWDER');
		expect(t({ snow48h: 8, snowRatio: 20 })).toBe('POWDER');
	});
});

describe('thaw', () => {
	it('fires when it is warm and nothing is coming', () => {
		expect(t({ snow48h: 0, tempMaxF: 39 })).toBe('THAW');
	});

	it('does NOT override a real snow event', () => {
		// A marginal warm spell during a dump should not relabel the day.
		expect(t({ snow48h: 9, tempMaxF: 36 })).toBe('POWDER');
	});

	it('needs to actually be above freezing', () => {
		expect(t({ snow48h: 0, tempMaxF: 33 })).toBe('FIRM');
	});
});

describe('thin', () => {
	it('fires on a low natural base with nothing coming', () => {
		expect(t({ snow48h: 0, naturalBaseInches: THIN_BASE_INCHES - 1 })).toBe('THIN');
	});

	it('does NOT fire when snow is on the way, since the base is about to change', () => {
		expect(t({ snow48h: 6, naturalBaseInches: 4 })).toBe('GOOD');
	});

	it('does not fire when the base is adequate', () => {
		expect(t({ snow48h: 0, naturalBaseInches: THIN_BASE_INCHES })).toBe('FIRM');
	});

	it('stays quiet when NOHRSC gave us nothing rather than guessing', () => {
		expect(t({ snow48h: 0, naturalBaseInches: null })).toBe('FIRM');
	});
});

describe('precedence', () => {
	it('is rain, then thaw, then thin', () => {
		expect(t({ snow48h: 0, rainRisk: true, tempMaxF: 40, naturalBaseInches: 2 })).toBe('RAIN');
		expect(t({ snow48h: 0, tempMaxF: 40, naturalBaseInches: 2 })).toBe('THAW');
		expect(t({ snow48h: 0, tempMaxF: 20, naturalBaseInches: 2 })).toBe('THIN');
	});
});

describe('describeDensity', () => {
	it('bands the ratio', () => {
		expect(describeDensity(20)).toBe('light');
		expect(describeDensity(15)).toBe('light');
		expect(describeDensity(11)).toBe('average');
		expect(describeDensity(8)).toBe('dense');
		expect(describeDensity(4)).toBe('dense');
	});

	it('says nothing when the ratio was not computable', () => {
		expect(describeDensity(null)).toBeNull();
	});
});

describe('isWindHold', () => {
	it('trips at lift-hold gusts and not below', () => {
		expect(isWindHold(35)).toBe(true);
		expect(isWindHold(34)).toBe(false);
		expect(isWindHold(null)).toBe(false);
	});
});
