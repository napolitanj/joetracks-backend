import { getNOAAGridpoint, getNOAAForecast, getNOAAHourlyForecast } from '../../noaa/noaa';
import { getNDFDSnowfall } from '../../noaa/ndfd';
import { parseSnowFromForecast } from '../../noaa/forecastParser';
import { normalizeForecast } from './normalize';
import type { Resort } from '../../data/michiganResorts';

export async function getFreshForecast(resort: Resort) {
	const grid = await getNOAAGridpoint(resort.lat, resort.lon);

	const daily = await getNOAAForecast(grid.gridId, grid.gridX, grid.gridY);

	const hourly = await getNOAAHourlyForecast(grid.gridId, grid.gridX, grid.gridY);

	let snow24h = 0;
	let snow72h = 0;

	let ndfd = null;
	try {
		ndfd = await getNDFDSnowfall(resort.lat, resort.lon);
	} catch (err) {}

	// If NDFD returned usable values
	if (ndfd && (ndfd.snow24h !== null || ndfd.snow72h !== null)) {
		snow24h = ndfd.snow24h ?? 0;
		snow72h = ndfd.snow72h ?? 0;
	} else {
		const parsed = parseSnowFromForecast(daily);
		snow24h = parsed.snow24h;
		snow72h = parsed.snow72h;
	}

	return normalizeForecast({ resort, grid, snow24h, snow72h, daily, hourly });
}
