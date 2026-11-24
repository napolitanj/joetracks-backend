/**
 * Turning a verdict and some numbers into a sentence a skier can act on.
 *
 * Two rules shape everything here.
 *
 * Variants are chosen by a hash of the resort id, not at random. The page must
 * read the same on a refresh, and forty-one rows must not all open with the
 * same four words.
 *
 * Missing data removes a clause, it never fills one. Depth history does not
 * exist for the first two days after a deploy, NOHRSC returns nothing over
 * some pixels, and density is unknowable at small totals. Every one of those
 * has to produce a shorter sentence rather than the word "undefined".
 */

import { describeDensity, isWindHold, type Tier } from './verdict';

export type StoryInput = {
	resortId: string;
	tier: Tier;
	snow24h: number;
	snow48h: number;
	past48h: number | null;
	naturalBaseInches: number | null;
	tempMaxF: number | null;
	windGustMph: number | null;
	snowRatio: number | null;
	timeZone?: string;
};

/** Stable per-resort seed, so the same hill keeps the same voice. */
function seedFrom(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h;
}

/** Salt keeps one resort from landing on the same index in every slot. */
function pick<T>(options: T[], seed: number, salt: number): T {
	return options[(seed + salt) % options.length];
}

const inches = (n: number) => `${n}"`;

function dayAfterTomorrow(timeZone: string): string {
	const d = new Date(Date.now() + 48 * 3_600_000);
	return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(d);
}

/** The opening clause: what is happening, and what already happened. */
function leadClause(input: StoryInput, seed: number, day: string): string {
	const { tier, snow24h, snow48h, past48h, naturalBaseInches, tempMaxF } = input;

	if (tier === 'RAIN') {
		return pick(
			[
				tempMaxF !== null ? `Rain likely at ${tempMaxF}°.` : 'Rain likely.',
				'Precipitation arriving as rain, not snow.',
				tempMaxF !== null ? `Wet and warm at ${tempMaxF}°, falling as rain.` : 'Falling as rain, not snow.',
			],
			seed,
			0,
		);
	}

	if (tier === 'THAW') {
		return pick(
			[
				tempMaxF !== null ? `Highs near ${tempMaxF}° over the next two days.` : 'Above freezing over the next two days.',
				tempMaxF !== null ? `Warming to ${tempMaxF}°, and what is there will soften.` : 'Warming, and what is there will soften.',
				tempMaxF !== null ? `Running ${tempMaxF}° through ${day}.` : `Above freezing through ${day}.`,
			],
			seed,
			1,
		);
	}

	if (tier === 'THIN') {
		const base = naturalBaseInches !== null ? inches(naturalBaseInches) : null;
		return pick(
			[
				base ? `Only ${base} of natural snow and nothing coming.` : 'Thin natural cover and nothing coming.',
				base ? `${base} of natural snow on the ground, with nothing in the forecast.` : 'Little natural snow, and nothing in the forecast.',
				base ? `Natural cover down to ${base}, no new snow through ${day}.` : `Thin cover, no new snow through ${day}.`,
			],
			seed,
			2,
		);
	}

	if (snow48h <= 0) {
		const quietBase = naturalBaseInches !== null ? inches(naturalBaseInches) : null;

		// A quiet forecast still deserves a sentence: what is on the ground is
		// the whole answer when nothing is falling.
		if (quietBase) {
			return pick(
				[
					`Nothing in the forecast, ${quietBase} of natural snow on the ground.`,
					`No new snow in the next two days. ${quietBase} of natural cover holding.`,
					`Quiet through ${day}, sitting on ${quietBase} of natural snow.`,
				],
				seed,
				3,
			);
		}

		return pick(['Nothing in the forecast.', 'No new snow in the next two days.', `Quiet through ${day}.`], seed, 3);
	}

	// Something is falling. Lead with what already landed when we know it.
	if (past48h !== null && past48h > 0) {
		return pick(
			[
				`${inches(past48h)} already down in two days, ${inches(snow48h)} more by ${day}.`,
				`${inches(past48h)} over the past two days with another ${inches(snow48h)} coming.`,
				`Up ${inches(past48h)} in two days, with ${inches(snow48h)} still to come.`,
			],
			seed,
			4,
		);
	}

	if (snow24h > 0 && snow24h < snow48h) {
		return pick(
			[
				`${inches(snow48h)} forecast over two days, ${inches(snow24h)} of it by tomorrow night.`,
				`${inches(snow24h)} in the next 24 hours, ${inches(snow48h)} through ${day}.`,
				`${inches(snow48h)} on the way, ${inches(snow24h)} of that arriving first.`,
			],
			seed,
			5,
		);
	}

	return pick(
		[
			`${inches(snow48h)} forecast through ${day}.`,
			`${inches(snow48h)} on the way.`,
			`Expecting ${inches(snow48h)} over the next two days.`,
		],
		seed,
		6,
	);
}

/** The middle clause: how that snow will actually behave. */
function densityClause(input: StoryInput, seed: number): string | null {
	const { tier, snow48h, tempMaxF, snowRatio } = input;

	if (snow48h <= 0 || tier === 'RAIN' || tier === 'THAW' || tier === 'THIN') return null;

	const density = describeDensity(snowRatio);

	// When it is warm enough that the caution clause will call it out, leave the
	// number to that clause. Saying "holding at 36" and then "it does touch 36"
	// in consecutive sentences reads like a bug, because it is one.
	const tempIsAProblem = tempMaxF !== null && tempMaxF > 34;
	const temp = tempMaxF !== null && !tempIsAProblem ? `${tempMaxF}°` : null;

	if (density === 'light') {
		return pick(
			[
				temp ? `Light and dry at ${temp}.` : 'Light and dry.',
				snowRatio !== null ? `Cold and low density, close to ${snowRatio} to 1.` : 'Cold and low density.',
				temp ? `Dry snow at ${temp}, it will blow around.` : 'Dry enough that it will blow around.',
			],
			seed,
			7,
		);
	}

	if (density === 'dense') {
		return pick(
			[
				temp ? `Dense and heavy at ${temp}, it will cover firm snow well.` : 'Dense and heavy, it will cover firm snow well.',
				'Wet, high-density snow that should fill in the groom.',
				temp ? `Heavy snow at ${temp}, better coverage than the number suggests.` : 'Heavy snow, better coverage than the number suggests.',
			],
			seed,
			8,
		);
	}

	if (!temp) return null;

	return pick([`Holding at ${temp}.`, `Temperatures steady at ${temp}.`, `Staying around ${temp}.`], seed, 9);
}

/** The closing clause: the thing that could still spoil it. */
function cautionClause(input: StoryInput, seed: number): string | null {
	const { tier, snow48h, naturalBaseInches, tempMaxF, windGustMph } = input;

	if (isWindHold(windGustMph)) {
		return pick([`Gusts to ${windGustMph} could put lifts on hold.`, `Wind gusting ${windGustMph}, expect lift holds.`], seed, 10);
	}

	// Snow is coming but it is landing on very little.
	if (snow48h >= 3 && naturalBaseInches !== null && naturalBaseInches < 10) {
		return pick(
			[`Natural base is still only ${inches(naturalBaseInches)}.`, `Thin underneath it at ${inches(naturalBaseInches)} natural.`],
			seed,
			11,
		);
	}

	// Warm enough to matter, but snow won the verdict.
	if (snow48h >= 3 && tempMaxF !== null && tempMaxF > 34) {
		return pick(
			[`Highs reach ${tempMaxF}° though, so expect it to set up.`, `It does touch ${tempMaxF}°, so it will not stay soft.`],
			seed,
			12,
		);
	}

	if (tier === 'RAIN') {
		return pick(['Expect it to strip the surface.', 'Whatever is there will take a hit.'], seed, 13);
	}

	if (tier === 'THIN') {
		return pick(['Check the resort before you drive.', 'Worth a call before committing to the drive.'], seed, 14);
	}

	return null;
}

export function buildStory(input: StoryInput): string {
	const seed = seedFrom(input.resortId);
	const day = dayAfterTomorrow(input.timeZone ?? 'America/Detroit');

	return [leadClause(input, seed, day), densityClause(input, seed), cautionClause(input, seed)].filter(Boolean).join(' ');
}

/**
 * The line above the list: where to go, in one sentence.
 *
 * Built from the whole set rather than per resort, so it can say "the Western
 * UP" instead of naming a hill nobody outside the Keweenaw has heard of.
 */
export type SummaryResort = {
	name: string;
	region: string;
	tier: Tier;
	snow48h: number;
	naturalBaseInches: number | null;
	tempMaxF: number | null;
};

export function buildSummary(resorts: SummaryResort[], timeZone = 'America/Detroit'): string {
	if (!resorts.length) return 'No forecast available right now.';

	const day = dayAfterTomorrow(timeZone);
	const ranked = [...resorts].sort((a, b) => b.snow48h - a.snow48h);

	// Score each region by its best three resorts, not its single best. One hill
	// catching a freak band should not send the whole state to the wrong half of
	// the map, which is what a plain maximum does.
	const byRegion = new Map<string, number[]>();
	for (const r of resorts) {
		if (!byRegion.has(r.region)) byRegion.set(r.region, []);
		byRegion.get(r.region)!.push(r.snow48h);
	}

	let bestRegion = ranked[0].region;
	let bestScore = -1;
	for (const [region, totals] of byRegion) {
		const top = [...totals].sort((a, b) => b - a).slice(0, 3);
		const score = top.reduce((a, b) => a + b, 0) / top.length;
		if (score > bestScore) {
			bestScore = score;
			bestRegion = region;
		}
	}

	// Lead with the best resort inside the region that is actually doing best.
	const leader = ranked.find((r) => r.region === bestRegion) ?? ranked[0];

	const parts: string[] = [];

	if (leader.snow48h >= 3) {
		parts.push(`The ${leader.region} is the call.`);
		parts.push(`${leader.name} leads with ${inches(leader.snow48h)} forecast over two days.`);
	} else if (leader.snow48h > 0) {
		parts.push(`Not much moving. ${leader.name} has the most coming at ${inches(leader.snow48h)}.`);
	} else {
		const deepest = [...resorts]
			.filter((r) => r.naturalBaseInches !== null)
			.sort((a, b) => (b.naturalBaseInches ?? 0) - (a.naturalBaseInches ?? 0))[0];

		if (deepest?.naturalBaseInches) {
			parts.push(`Nothing significant in the forecast through ${day}.`);
			parts.push(`${deepest.name} holds the deepest natural base at ${inches(deepest.naturalBaseInches)}.`);
		} else {
			parts.push(`Nothing significant in the forecast through ${day}.`);
		}
	}

	const wetRegions = [...new Set(resorts.filter((r) => r.tier === 'RAIN').map((r) => r.region))];
	const warmRegions = [...new Set(resorts.filter((r) => r.tier === 'THAW').map((r) => r.region))];

	if (wetRegions.length === 1) {
		parts.push(`Rain is moving through the ${wetRegions[0]}.`);
	} else if (wetRegions.length > 1) {
		parts.push('Rain is moving through the southern half of the state.');
	} else if (warmRegions.length >= 3) {
		parts.push('Warm across most of the state.');
	} else if (warmRegions.length) {
		parts.push(`Above freezing in the ${warmRegions[0]}.`);
	}

	return parts.join(' ');
}
