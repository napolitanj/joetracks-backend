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
 *
 * There is no tier for a thin base. Snow depth here comes from the NOHRSC
 * SNODAS model at 1km resolution, and checked against ground observations it
 * is wrong by multiples in both directions: around Ironwood it reads 3.9 to
 * 5.5 inches where stations four miles away at matching elevation report 1 to
 * 2, and in the Keweenaw it reads 0 to 1.2 where the nearest observations
 * report 2 to 2.5. It cannot carry a threshold. See describeSnowpackTrend for
 * the one thing it is still good for.
 */

export type Tier = 'STORM' | 'POWDER' | 'GOOD' | 'REFRESH' | 'FIRM' | 'THAW' | 'RAIN';

/** Forecast snow over 48h, in inches, at or above which each tier applies. */
export const SNOW_TIERS: Array<{ tier: Tier; min: number }> = [
	{ tier: 'STORM', min: 15 },
	{ tier: 'POWDER', min: 7 },
	{ tier: 'GOOD', min: 3 },
	{ tier: 'REFRESH', min: 1 },
	{ tier: 'FIRM', min: 0 },
];

/** Incoming snow that makes a warm spell beside the point. */
const MEANINGFUL_SNOW_INCHES = 3;

/** A ratio this low means most of the water is not arriving as snow. */
const WET_RATIO = 5;

/** Above this the surface softens, in Fahrenheit. */
const THAW_TEMP_F = 34;

/** Gusts at or above this put Michigan lifts on hold. */
export const WIND_HOLD_MPH = 35;

export type VerdictInput = {
	snow48h: number;
	tempMaxF: number | null;
	windGustMph: number | null;
	rainRisk: boolean;
	snowRatio: number | null;
};

/**
 * Pick the tier.
 *
 * Precedence is RAIN, THAW, then the snow tiers. Rain always wins, because
 * rain on ten inches of new snow still ruins it. Thaw is conditional on
 * nothing much coming: a resort about to be buried is not thawing in any way
 * the skier cares about, and the warmth gets mentioned in the sentence
 * instead of overriding the verdict.
 */
export function decideTier(input: VerdictInput): Tier {
	const { snow48h, tempMaxF, rainRisk, snowRatio } = input;

	const wetSignal = snowRatio !== null && snowRatio < WET_RATIO;
	if (rainRisk || wetSignal) return 'RAIN';

	const incoming = snow48h >= MEANINGFUL_SNOW_INCHES;
	if (!incoming && tempMaxF !== null && tempMaxF > THAW_TEMP_F) return 'THAW';

	for (const { tier, min } of SNOW_TIERS) {
		if (snow48h >= min) return tier;
	}

	return 'FIRM';
}

export type Density = 'light' | 'average' | 'dense';

/**
 * How the forecast snow will behave underfoot.
 *
 * Around 10:1 is average. Above 15:1 is cold and dry, which skis well when it
 * is deep and vanishes into the groom when it is not. At or below 8:1 it is
 * heavy and wet, which covers firm surfaces far better than its depth suggests.
 */
export function describeDensity(snowRatio: number | null): Density | null {
	if (snowRatio === null) return null;
	if (snowRatio >= 15) return 'light';
	if (snowRatio <= 8) return 'dense';
	return 'average';
}

export type SnowpackTrend = 'building' | 'holding' | 'losing';

/**
 * Whether the modelled snowpack grew or shrank, and nothing more precise.
 *
 * The absolute depth from SNODAS is not publishable at resort scale, but a
 * persistent model bias largely cancels in a difference, so the DIRECTION of
 * change survives it where the level does not. Reported as a word rather than
 * a number for exactly that reason: the sign is defensible, the magnitude is
 * not.
 */
const TREND_NOISE_INCHES = 0.5;

export function describeSnowpackTrend(change48h: number | null): SnowpackTrend | null {
	if (change48h === null) return null;
	if (change48h > TREND_NOISE_INCHES) return 'building';
	if (change48h < -TREND_NOISE_INCHES) return 'losing';
	return 'holding';
}

export function isWindHold(windGustMph: number | null): boolean {
	return windGustMph !== null && windGustMph >= WIND_HOLD_MPH;
}
