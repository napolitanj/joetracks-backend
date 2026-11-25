/**
 * Turning a verdict and some numbers into a sentence a skier can act on.
 *
 * The register is deliberately technical and the phrasing is deliberately
 * repetitive. Two resorts with the same conditions should read the same way:
 * this is a weather readout, not copy, and a reader comparing forty-one rows
 * is served better by consistent wording than by variety. That is why there is
 * no variant selection here.
 *
 * Missing data removes a clause, it never fills one. Depth history does not
 * exist for the first two days after a deploy, density is unknowable at small
 * totals, and some gridpoints carry no wind series. Every one of those has to
 * produce a shorter sentence rather than the word "undefined".
 *
 * Nothing here states a snow depth. See verdict.ts for why.
 */

import { describeDensity, describeSnowpackTrend, isWindHold, type Tier } from './verdict';

export type StoryInput = {
	tier: Tier;
	snow24h: number;
	snow48h: number;
	depthChange48h: number | null;
	tempMaxF: number | null;
	tempMinF: number | null;
	windGustMph: number | null;
	snowRatio: number | null;
};

const inches = (n: number) => `${n}"`;
const degrees = (n: number) => `${n}°F`;

/** What is forecast to fall, and over what window. */
function accumulationClause(input: StoryInput): string | null {
	const { tier, snow24h, snow48h } = input;

	if (tier === 'RAIN') return null;

	if (snow48h <= 0) return 'No accumulation forecast through 48 hours.';

	if (snow24h > 0 && snow24h < snow48h) {
		return `${inches(snow48h)} forecast over 48 hours, ${inches(snow24h)} of it within 24.`;
	}

	return `${inches(snow48h)} forecast over 48 hours.`;
}

/** Temperature, and what it does to the surface. */
function temperatureClause(input: StoryInput): string | null {
	const { tier, tempMaxF, tempMinF } = input;

	if (tempMaxF === null) return null;

	if (tier === 'RAIN') {
		return `Precipitation falling as rain at ${degrees(tempMaxF)}. Expect existing snow to deteriorate.`;
	}

	if (tier === 'THAW') {
		// Softening follows from the temperature. Whether it refreezes depends on
		// the overnight low, so that is only claimed when the low supports it.
		const refreeze = tempMinF !== null && tempMinF < 32 ? ' Expect refreeze overnight.' : '';
		return `Maximum ${degrees(tempMaxF)}, above freezing. Expect surface softening.${refreeze}`;
	}

	if (tempMaxF > 34) {
		return `Maximum reaches ${degrees(tempMaxF)}; expect accumulation to settle.`;
	}

	if (tempMinF !== null) {
		return `Temperatures ${degrees(tempMinF)} to ${degrees(tempMaxF)}.`;
	}

	return `Maximum ${degrees(tempMaxF)}.`;
}

/** Density, stated as the ratio and its consequence. */
function densityClause(input: StoryInput): string | null {
	const { tier, snow48h, snowRatio } = input;

	if (snow48h <= 0 || tier === 'RAIN' || tier === 'THAW') return null;

	const density = describeDensity(snowRatio);
	if (!density || snowRatio === null) return null;

	if (density === 'light') {
		return `Snow-to-liquid ratio near ${snowRatio}:1, low density: limited coverage per inch and subject to wind transport.`;
	}

	if (density === 'dense') {
		return `Snow-to-liquid ratio near ${snowRatio}:1, high density: greater coverage per inch over firm surfaces.`;
	}

	// Average density tells the reader nothing they can act on. Only the ends
	// of the range change how the snow will ski, so only those get a sentence.
	return null;
}

/**
 * Which way the modelled snowpack is moving. Direction only, never a figure:
 * the underlying model is not accurate enough at this scale to quantify.
 */
function snowpackClause(input: StoryInput): string | null {
	const trend = describeSnowpackTrend(input.depthChange48h);
	if (!trend) return null;

	if (trend === 'building') return 'Modelled snowpack increasing over the past 48 hours.';
	if (trend === 'losing') return 'Modelled snowpack decreasing over the past 48 hours.';

	// "Unchanged" is a sentence that appears on most rows most of the time and
	// carries no information. Omitted.
	return null;
}

/**
 * Wind, stated as a measurement only.
 *
 * Earlier drafts added "lift holds possible". Whether a lift holds is the
 * resort's operational call, made on their own thresholds and their own
 * anemometers, and this tool has no business predicting it. The gust figure is
 * the fact; readers who know what it means for a given hill can draw the
 * conclusion themselves.
 */
function windClause(input: StoryInput): string | null {
	if (!isWindHold(input.windGustMph)) return null;
	return `Gusts to ${input.windGustMph} mph.`;
}

export function buildStory(input: StoryInput): string {
	return [accumulationClause(input), temperatureClause(input), densityClause(input), snowpackClause(input), windClause(input)]
		.filter(Boolean)
		.join(' ');
}

/**
 * The line above the list: where conditions are best, in one sentence.
 *
 * Built from the whole set rather than per resort, so it can name a region
 * instead of a single hill.
 */
export type SummaryResort = {
	name: string;
	region: string;
	tier: Tier;
	snow48h: number;
};

export function buildSummary(resorts: SummaryResort[]): string {
	if (!resorts.length) return 'No forecast data available.';

	const ranked = [...resorts].sort((a, b) => b.snow48h - a.snow48h);

	// Score each region by its best three resorts, not its single best. One hill
	// catching a freak band should not speak for half the state.
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

	const leader = ranked.find((r) => r.region === bestRegion) ?? ranked[0];
	const parts: string[] = [];

	if (leader.snow48h >= 3) {
		parts.push(
			`Highest forecast accumulation is in the ${leader.region}, led by ${leader.name} at ${inches(leader.snow48h)} over 48 hours.`,
		);
	} else if (leader.snow48h > 0) {
		parts.push(`Minimal accumulation statewide. ${leader.name} has the highest forecast at ${inches(leader.snow48h)} over 48 hours.`);
	} else {
		parts.push('No significant accumulation forecast statewide over the next 48 hours.');
	}

	const wetRegions = [...new Set(resorts.filter((r) => r.tier === 'RAIN').map((r) => r.region))];
	const warmRegions = [...new Set(resorts.filter((r) => r.tier === 'THAW').map((r) => r.region))];

	if (wetRegions.length === 1) {
		parts.push(`Rain forecast in the ${wetRegions[0]}.`);
	} else if (wetRegions.length > 1) {
		parts.push(`Rain forecast in ${wetRegions.length} of 4 regions.`);
	} else if (warmRegions.length >= 3) {
		parts.push('Temperatures above freezing across most of the state.');
	} else if (warmRegions.length) {
		parts.push(`Temperatures above freezing in the ${warmRegions[0]}.`);
	}

	return parts.join(' ');
}
