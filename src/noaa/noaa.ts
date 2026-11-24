/**
 * Thin client for the National Weather Service API.
 *
 * The NWS asks every caller to identify itself in User-Agent and will throttle
 * or block anonymous traffic, so every request here carries one.
 */

const USER_AGENT = 'joetracks.com (contact@joetracks.com)';

/** Fetch JSON, retrying once on a server error or network fault. */
async function getJson(url: string): Promise<any> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

			if (response.ok) return await response.json();

			// 4xx will not improve on retry; only a 5xx is worth a second attempt.
			if (response.status < 500) {
				throw new Error(`NWS request failed: ${response.status} ${url}`);
			}
		} catch (err) {
			if (attempt === 1) throw err;
		}
	}

	throw new Error(`NWS request failed after retry: ${url}`);
}

export type GridRef = {
	gridId: string;
	gridX: number;
	gridY: number;
};

/**
 * Resolve a coordinate to its forecast grid cell.
 *
 * Only needed when adding a resort. Grid cells do not move, so the result is
 * stored in the resort data file rather than looked up on every refresh.
 */
export async function getNOAAGridpoint(lat: number, lon: number): Promise<GridRef> {
	const data = await getJson(`https://api.weather.gov/points/${lat},${lon}`);

	return {
		gridId: data.properties.gridId,
		gridX: data.properties.gridX,
		gridY: data.properties.gridY,
	};
}

/**
 * Fetch the raw numeric forecast for a grid cell.
 *
 * This is the endpoint with no suffix. It returns every weather element as a
 * time series of real numbers, which is what the tracker needs. The /forecast
 * and /forecast/hourly variants return the same data rendered as English prose
 * for human readers, and parsing that prose back into numbers is guesswork.
 */
export async function getGridpointData(grid: GridRef): Promise<Record<string, any>> {
	const data = await getJson(`https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}`);

	if (!data?.properties) {
		throw new Error(`NWS gridpoint response had no properties: ${grid.gridId}/${grid.gridX},${grid.gridY}`);
	}

	return data.properties;
}
