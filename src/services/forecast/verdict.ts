/**
 * Turning numbers into a verdict.
 *
 * Thresholds are Joe's, set against Michigan conditions rather than western
 * ones: three inches here is a real refresh on a groomed base, and fifteen is
 * the storm people drive five hours for.
 *
 * Density deliberately does NOT move the tier. A verdict that shifts for
 * reasons the reader cannot see in the numbers reads as broken. Density goes
 * in the sentence instead, where it can say what it actually means.
 */

export type Tier = 'STORM' | 'POWDER' | 'GOOD' | 'REFRESH' | 'FIRM' | 'THIN' | 'THAW' | 'RAIN';

/** Forecast snow over 48h, in inches, at or above which each tier applies. */
export const SNOW_TIERS: Array<{ tier: Tier; min: number }> = [
	{ tier: 'STORM', min: 15 },
	{ tier: 'POWDER', min: 7 },
	{ tier: 'GOOD', min: 3 },
	{ tier: 'REFRESH', min: 1 },
	{ tier: 'FIRM', min: 0 },
];

/** Natural base below which a resort is thin, absent snowmaking we cannot see. */
export const THIN_BASE_INCHES = 10;

/** Incoming snow that makes a low base or a warm spell beside the point. */
const MEANINGFUL_SNOW_INCHES = 3;

/** A ratio this low means most of the water is not arriving as snow. */
const WET_RATIO = 5;

/** Gusts at or above this put Michigan lifts on hold. */
export const WIND_HOLD_MPH = 35;

export type VerdictInput = {
	snow48h: number;
	tempMaxF: number | null;
	windGustMph: number | null;
	rainRisk: boolean;
	thawRisk: boolean;
	snowRatio: number | null;
	naturalBaseInches: number | null;
};

/**
 * Pick the tier.
 *
 * Precedence is RAIN, THAW, THIN, then the snow tiers. Rain always wins,
 * because rain on ten inches of new snow still ruins it. Thaw and thin are
 * both conditional on nothing much coming: a resort about to be buried is
 * neither thin nor thawing in any way the skier cares about, and the warmth
 * gets mentioned in the sentence instead of overriding the verdict.
 */
export function decideTier(input: VerdictInput): Tier {
	const { snow48h, tempMaxF, rainRisk, snowRatio, naturalBaseInches } = input;

	const wetSignal = snowRatio !== null && snowRatio < WET_RATIO;
	if (rainRisk || wetSignal) return 'RAIN';

	const incoming = snow48h >= MEANINGFUL_SNOW_INCHES;

	if (!incoming && tempMaxF !== null && tempMaxF > 34) return 'THAW';
	if (!incoming && naturalBaseInches !== null && naturalBaseInches < THIN_BASE_INCHES) return 'THIN';

	for (const { tier, min } of SNOW_TIERS) {
		if (snow48h >= min) return tier;
	}

	return 'FIRM';
}

export type Density = 'light' | 'average' | 'dense';

/**
 * How the forecast snow will behave underfoot.
 *
 * Around 10:1 is average. Above 15:1 is cold and dry, which skis beautifully
 * when it is deep and disappears into the groom when it is not. Below 8:1 is
 * heavy and wet, which covers firm snow far better than its depth suggests.
 */
export function describeDensity(snowRatio: number | null): Density | null {
	if (snowRatio === null) return null;
	if (snowRatio >= 15) return 'light';
	if (snowRatio <= 8) return 'dense';
	return 'average';
}

export function isWindHold(windGustMph: number | null): boolean {
	return windGustMph !== null && windGustMph >= WIND_HOLD_MPH;
}
