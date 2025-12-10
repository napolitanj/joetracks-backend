import { getNOAAGridpoint, getNOAAForecast } from '../../noaa/noaa';
import { parseSnowFromForecast } from '../../noaa/forecastParser';
import { normalizeForecast } from './normalize';
import type { Resort } from '../../data/michiganResorts';

export async function getFreshForecast(resort: Resort) {
  const grid = await getNOAAGridpoint(resort.lat, resort.lon);
  const daily = await getNOAAForecast(grid.gridId, grid.gridX, grid.gridY);

  const parsed = parseSnowFromForecast(daily);
  const snow24h = parsed.snow24h ?? 0;
  const snow72h = parsed.snow72h ?? 0;

  return normalizeForecast({ resort, grid, snow24h, snow72h });
}
