import { describe, it, expect } from 'vitest';
import { decideTier, describeDensity, describeSnowpackTrend, isWindHold } from '../src/services/forecast/verdict';

const base = {
	snow48h: 0,
	tempMaxF: 25,
	windGustMph: 10,
	rainRisk: false,
	snowRatio: null as number | null,
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
		expect(t({ snow48h: 9, tempMaxF: 36 })).toBe('POWDER');
	});

	it('needs to actually be above freezing', () => {
		expect(t({ snow48h: 0, tempMaxF: 33 })).toBe('FIRM');
	});
});

describe('there is no thin-base tier', () => {
	// SNODAS is wrong by multiples at resort scale in both directions, so no
	// threshold can be hung on it. Re-adding one needs a better data source.
	it('never returns THIN', () => {
		const tiers = new Set<string>();
		for (const snow of [0, 1, 3, 7, 15]) {
			for (const temp of [10, 25, 33, 39]) {
				for (const rain of [true, false]) {
					tiers.add(t({ snow48h: snow, tempMaxF: temp, rainRisk: rain }));
				}
			}
		}
		expect([...tiers]).not.toContain('THIN');
	});
});

describe('precedence', () => {
	it('is rain, then thaw, then the snow tiers', () => {
		expect(t({ snow48h: 0, rainRisk: true, tempMaxF: 40 })).toBe('RAIN');
		expect(t({ snow48h: 0, tempMaxF: 40 })).toBe('THAW');
		expect(t({ snow48h: 5, tempMaxF: 20 })).toBe('GOOD');
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

describe('describeSnowpackTrend', () => {
	it('reports direction past the noise floor', () => {
		expect(describeSnowpackTrend(2)).toBe('building');
		expect(describeSnowpackTrend(-2)).toBe('losing');
	});

	it('treats small movement as unchanged, since the model cannot resolve it', () => {
		expect(describeSnowpackTrend(0.5)).toBe('holding');
		expect(describeSnowpackTrend(-0.5)).toBe('holding');
		expect(describeSnowpackTrend(0)).toBe('holding');
	});

	it('says nothing without history', () => {
		expect(describeSnowpackTrend(null)).toBeNull();
	});
});

describe('isWindHold', () => {
	it('trips at lift-hold gusts and not below', () => {
		expect(isWindHold(35)).toBe(true);
		expect(isWindHold(34)).toBe(false);
		expect(isWindHold(null)).toBe(false);
	});
});
