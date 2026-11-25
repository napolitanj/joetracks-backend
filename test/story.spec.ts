import { describe, it, expect } from 'vitest';
import { buildStory, buildSummary, type StoryInput, type SummaryResort } from '../src/services/forecast/story';

const full: StoryInput = {
	tier: 'POWDER',
	snow24h: 5,
	snow48h: 9,
	depthChange48h: 2.5,
	tempMaxF: 21,
	tempMinF: 11,
	windGustMph: 14,
	snowRatio: 12,
};
const story = (over: Partial<StoryInput> = {}) => buildStory({ ...full, ...over });

const LEAKS = /undefined|null|NaN|\[object|Infinity/;

describe('no story ever leaks a missing value', () => {
	const holes: Array<[string, Partial<StoryInput>]> = [
		['no depth history yet', { depthChange48h: null }],
		['no temperature in the grid', { tempMaxF: null, tempMinF: null }],
		['no minimum temperature', { tempMinF: null }],
		['no wind data', { windGustMph: null }],
		['density not computable', { snowRatio: null }],
		['nothing but the forecast', { depthChange48h: null, tempMaxF: null, tempMinF: null, windGustMph: null, snowRatio: null }],
	];

	for (const [label, over] of holes) {
		it(`stays clean when ${label}`, () => {
			for (const tier of ['STORM', 'POWDER', 'GOOD', 'REFRESH', 'FIRM', 'THAW', 'RAIN'] as const) {
				const out = story({ ...over, tier });
				expect(out, `${tier} / ${label}`).not.toMatch(LEAKS);
			}
		});
	}

	it('survives a completely empty forecast', () => {
		const out = buildStory({
			tier: 'FIRM',
			snow24h: 0,
			snow48h: 0,
			depthChange48h: null,
			tempMaxF: null,
			tempMinF: null,
			windGustMph: null,
			snowRatio: null,
		});
		expect(out).not.toMatch(LEAKS);
		expect(out.length).toBeGreaterThan(5);
	});
});

describe('never states a snow depth', () => {
	// The model behind it is wrong by multiples at resort scale. The sentence
	// may say which way the pack is moving, never how deep it is.
	it('reports trend as a direction, with no figure attached', () => {
		const building = story({ depthChange48h: 4.2 });
		expect(building).toMatch(/snowpack increasing/i);
		expect(building).not.toMatch(/4\.2/);

		const losing = story({ depthChange48h: -3.7 });
		expect(losing).toMatch(/snowpack decreasing/i);
		expect(losing).not.toMatch(/3\.7/);
	});

	it('omits the clause entirely before any history exists', () => {
		expect(story({ depthChange48h: null })).not.toMatch(/snowpack/i);
	});

	it('never uses the words base or depth followed by a measurement', () => {
		for (const change of [null, -5, 0, 5]) {
			expect(story({ depthChange48h: change })).not.toMatch(/\b(base|depth)\b[^.]*\d/i);
		}
	});
});

describe('technical register', () => {
	it('states accumulation with both windows when they differ', () => {
		expect(story({ snow24h: 5, snow48h: 9 })).toMatch(/9" forecast over 48 hours, 5" of it within 24/);
	});

	it('states the ratio numerically and its consequence at the ends of the range', () => {
		expect(story({ snowRatio: 19 })).toMatch(/ratio near 19:1/);
		expect(story({ snowRatio: 19 })).toMatch(/low density/i);
		expect(story({ snowRatio: 6 })).toMatch(/high density/i);
	});

	it('says nothing about density when it is unremarkable', () => {
		// Precise but useless on most rows most of the time.
		expect(story({ snowRatio: 11 })).not.toMatch(/ratio|density/i);
	});

	it('says nothing about the snowpack when it has not moved', () => {
		expect(story({ depthChange48h: 0.1 })).not.toMatch(/snowpack/i);
	});

	it('describes rain as deterioration rather than colloquially', () => {
		const out = story({ tier: 'RAIN', tempMaxF: 41 });
		expect(out).toMatch(/falling as rain at 41°F/);
		expect(out).toMatch(/expect existing snow to deteriorate/i);
		expect(out).not.toMatch(/take a hit|strip/i);
	});

	it('gives a temperature range when both ends are known', () => {
		expect(story({ tempMaxF: 24, tempMinF: 9 })).toMatch(/Temperatures 9°F to 24°F\./);
	});

	it('states wind as a measurement and never predicts lift operations', () => {
		const out = story({ windGustMph: 44 });
		expect(out).toMatch(/Gusts to 44 mph\./);
		expect(out).not.toMatch(/lift|hold|closed|spinning/i);
	});

	it('only claims a refreeze when the overnight low supports it', () => {
		expect(story({ tier: 'THAW', tempMaxF: 39, tempMinF: 28 })).toMatch(/refreeze/i);
		expect(story({ tier: 'THAW', tempMaxF: 42, tempMinF: 36 })).not.toMatch(/refreeze/i);
	});

	it('is identical for two resorts with identical conditions', () => {
		expect(story()).toBe(story());
	});
});

describe('buildSummary', () => {
	const r = (over: Partial<SummaryResort>): SummaryResort => ({
		name: 'Boyne Mountain',
		region: 'Northern LP',
		tier: 'FIRM',
		snow48h: 0,
		...over,
	});

	it('does not let one outlier speak for an otherwise quiet region', () => {
		// Treetops catches a lake-effect band while the rest of the Northern LP
		// gets nothing. The Western UP is broadly snowy. Scoring a region by its
		// best THREE rather than its best one is what keeps the answer honest:
		// Northern LP averages 6.3 across its top three, Western UP averages 11.
		const out = buildSummary([
			r({ name: 'Treetops', region: 'Northern LP', tier: 'STORM', snow48h: 19 }),
			r({ name: 'Boyne Mountain', region: 'Northern LP', tier: 'FIRM', snow48h: 0 }),
			r({ name: 'Crystal Mountain', region: 'Northern LP', tier: 'FIRM', snow48h: 0 }),
			r({ name: "Nub's Nob", region: 'Northern LP', tier: 'FIRM', snow48h: 0 }),
			r({ name: 'Mount Bohemia', region: 'Western UP', tier: 'POWDER', snow48h: 12 }),
			r({ name: 'Big Powderhorn', region: 'Western UP', tier: 'POWDER', snow48h: 11 }),
			r({ name: 'Porcupine Mountains', region: 'Western UP', tier: 'POWDER', snow48h: 10 }),
		]);
		expect(out).toMatch(/Western UP/);
		expect(out).toMatch(/Mount Bohemia/);
	});

	it('still names a single genuinely exceptional hill when its region is thin', () => {
		// The flip side: one resort at 19" with nothing else reported in that
		// region is not an artefact, it is the answer.
		const out = buildSummary([
			r({ name: 'Treetops', region: 'Northern LP', tier: 'STORM', snow48h: 19 }),
			r({ name: 'Mount Bohemia', region: 'Western UP', tier: 'POWDER', snow48h: 11 }),
		]);
		expect(out).toMatch(/Northern LP/);
		expect(out).toMatch(/Treetops/);
	});

	it('states the quiet case plainly', () => {
		expect(buildSummary([r({ snow48h: 0 })])).toMatch(/No significant accumulation/i);
	});

	it('flags rain by region', () => {
		const out = buildSummary([
			r({ name: 'Mount Bohemia', region: 'Western UP', tier: 'POWDER', snow48h: 9 }),
			r({ name: 'Pine Knob', region: 'Southern LP', tier: 'RAIN', snow48h: 0 }),
		]);
		expect(out).toMatch(/Rain forecast in the Southern LP/);
	});

	it('never leaks a missing value', () => {
		expect(buildSummary([r({})])).not.toMatch(LEAKS);
		expect(buildSummary([])).not.toMatch(LEAKS);
	});
});
