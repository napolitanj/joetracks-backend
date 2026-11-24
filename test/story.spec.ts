import { describe, it, expect } from 'vitest';
import { buildStory, buildSummary, type StoryInput, type SummaryResort } from '../src/services/forecast/story';

const full: StoryInput = {
	resortId: 'boyne-mountain',
	tier: 'POWDER',
	snow24h: 5,
	snow48h: 9,
	past48h: 6,
	naturalBaseInches: 28,
	tempMaxF: 21,
	windGustMph: 14,
	snowRatio: 12,
};
const story = (over: Partial<StoryInput> = {}) => buildStory({ ...full, ...over });

/** The failure mode that matters: a hole in the data reaching the reader. */
const LEAKS = /undefined|null|NaN|\[object|Infinity/;

describe('no story ever leaks a missing value', () => {
	const holes: Array<[string, Partial<StoryInput>]> = [
		['no depth history yet', { past48h: null }],
		['NOHRSC gave no base', { naturalBaseInches: null }],
		['no temperature in the grid', { tempMaxF: null }],
		['no wind data', { windGustMph: null }],
		['density not computable', { snowRatio: null }],
		['nothing at all but the forecast', { past48h: null, naturalBaseInches: null, tempMaxF: null, windGustMph: null, snowRatio: null }],
	];

	for (const [label, over] of holes) {
		it(`stays clean when ${label}`, () => {
			for (const tier of ['STORM', 'POWDER', 'GOOD', 'REFRESH', 'FIRM', 'THIN', 'THAW', 'RAIN'] as const) {
				const out = story({ ...over, tier });
				expect(out, `${tier} / ${label}`).not.toMatch(LEAKS);
				expect(out.length, `${tier} / ${label}`).toBeGreaterThan(10);
			}
		});
	}

	it('survives a completely empty forecast', () => {
		const out = buildStory({
			resortId: 'x',
			tier: 'FIRM',
			snow24h: 0,
			snow48h: 0,
			past48h: null,
			naturalBaseInches: null,
			tempMaxF: null,
			windGustMph: null,
			snowRatio: null,
		});
		expect(out).not.toMatch(LEAKS);
		expect(out.length).toBeGreaterThan(5);
	});
});

describe('variant selection', () => {
	it('is stable, so the page does not reshuffle on refresh', () => {
		expect(story()).toBe(story());
	});

	it('gives different resorts different wording', () => {
		const ids = ['boyne-mountain', 'bohemia', 'crystal', 'nubs', 'caberfae', 'porcupine', 'ski-brule', 'treetops'];
		const sentences = new Set(ids.map((resortId) => story({ resortId })));
		// Same numbers, different hills: most should not read identically.
		expect(sentences.size).toBeGreaterThan(2);
	});
});

describe('density reaches the sentence', () => {
	it('calls out dry snow', () => {
		const out = story({ snowRatio: 20, tempMaxF: 12 });
		expect(out.toLowerCase()).toMatch(/light|dry|low density/);
	});

	it('calls out heavy snow and says it covers', () => {
		const out = story({ snowRatio: 6, tempMaxF: 30 });
		expect(out.toLowerCase()).toMatch(/dense|heavy|wet/);
	});

	it('says nothing about density when the ratio was not computable', () => {
		const out = story({ snowRatio: null });
		expect(out.toLowerCase()).not.toMatch(/density|dry snow|dense/);
	});
});

describe('cautions', () => {
	it('warns about lift holds on big gusts', () => {
		expect(story({ windGustMph: 44 }).toLowerCase()).toMatch(/gust|lift/);
	});

	it('notes a thin base even when good snow is coming', () => {
		expect(story({ snow48h: 8, naturalBaseInches: 5, windGustMph: 10 }).toLowerCase()).toMatch(/natural/);
	});

	it('mentions warmth during a snow event instead of hiding it', () => {
		expect(story({ snow48h: 8, tempMaxF: 37, naturalBaseInches: 30, windGustMph: 10 })).toMatch(/37/);
	});
});

describe('buildSummary', () => {
	const r = (over: Partial<SummaryResort>): SummaryResort => ({
		name: 'Boyne Mountain',
		region: 'Northern LP',
		tier: 'FIRM',
		snow48h: 0,
		naturalBaseInches: 20,
		tempMaxF: 25,
		...over,
	});

	it('names the region and the leader when something is happening', () => {
		const out = buildSummary([
			r({ name: 'Mount Bohemia', region: 'Western UP', tier: 'STORM', snow48h: 16 }),
			r({ snow48h: 1, tier: 'REFRESH' }),
		]);
		expect(out).toMatch(/Western UP/);
		expect(out).toMatch(/Mount Bohemia/);
		expect(out).toMatch(/16"/);
	});

	it('falls back to the deepest base when nothing is coming', () => {
		const out = buildSummary([r({ snow48h: 0, naturalBaseInches: 31, name: 'Porcupine Mountains' })]);
		expect(out).toMatch(/Porcupine Mountains/);
		expect(out).toMatch(/31"/);
	});

	it('flags rain by region', () => {
		const out = buildSummary([
			r({ name: 'Mount Bohemia', region: 'Western UP', tier: 'POWDER', snow48h: 9 }),
			r({ name: 'Pine Knob', region: 'Southern LP', tier: 'RAIN', snow48h: 0 }),
		]);
		expect(out).toMatch(/Rain/);
		expect(out).toMatch(/Southern LP/);
	});

	it('never leaks a missing value', () => {
		expect(buildSummary([r({ naturalBaseInches: null, tempMaxF: null })])).not.toMatch(LEAKS);
		expect(buildSummary([])).not.toMatch(LEAKS);
	});
});
