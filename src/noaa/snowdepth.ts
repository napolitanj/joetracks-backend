/**
 * Natural snow depth on the ground, from the NOHRSC National Snow Analysis.
 *
 * NOHRSC publishes its daily SNODAS model as an ArcGIS map service, which
 * answers point queries in plain JSON. That matters: the same data is also
 * distributed as GeoTIFF and GRIB2, neither of which a Worker can parse.
 *
 * Layer 3 is snow depth (SNODAS product ssmv11036, metres). Layer 7 is snow
 * water equivalent (ssmv11034), kept here for a future density-on-the-ground
 * reading but not used yet.
 *
 * IMPORTANT: this is NATURAL snow only. The model has no idea snowmaking
 * exists, so a groomed Michigan resort can be skiing a deep machine-made base
 * while this reads two inches. Never present it as the resort's reported base.
 */

const SERVICE = 'https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer/identify';

// Image sublayer of the Snow Depth group. Verified against a known point: the
// service returned 0.17 for the western UP and classified it into its own
// "3.9 - 9.8 inches" band, which is 0.17 m. So this raster reports METRES.
//
// The water-equivalent raster is layer 7, and it does NOT share these units: it
// returns MILLIMETRES (24 at the same point, classified "0.39 - 0.98 inches").
// Anything added here for water equivalent needs its own conversion. Reusing
// METRES_TO_INCHES on it would be wrong by a factor of a thousand.
const LAYER_SNOW_DEPTH = 3;
const METRES_TO_INCHES = 39.3701;

/** A depth beyond this is a bad pixel, not a Michigan ski hill. */
const SANITY_LIMIT_INCHES = 300;

export async function getNaturalSnowDepthInches(lat: number, lon: number): Promise<number | null> {
	const params = new URLSearchParams({
		geometry: `${lon},${lat}`,
		geometryType: 'esriGeometryPoint',
		tolerance: '2',
		// A small box around the point. The service needs an extent and a display
		// size to resolve a pixel; the exact values do not affect the result.
		mapExtent: `${lon - 1},${lat - 1},${lon + 1},${lat + 1}`,
		imageDisplay: '800,600,96',
		layers: `all:${LAYER_SNOW_DEPTH}`,
		returnGeometry: 'false',
		f: 'json',
	});

	const response = await fetch(`${SERVICE}?${params}`, {
		headers: { 'User-Agent': 'joetracks.com (contact@joetracks.com)' },
	});

	if (!response.ok) throw new Error(`NOHRSC request failed: ${response.status}`);

	const data: any = await response.json();
	const raw = data?.results?.[0]?.attributes?.['Service Pixel Value'];

	// Outside the modelled area, or over water, the service answers with a
	// placeholder string rather than a number.
	if (raw == null) return null;

	const metres = Number(raw);
	if (!Number.isFinite(metres) || metres < 0) return null;

	const inches = metres * METRES_TO_INCHES;
	if (inches > SANITY_LIMIT_INCHES) return null;

	return Math.round(inches * 10) / 10;
}
