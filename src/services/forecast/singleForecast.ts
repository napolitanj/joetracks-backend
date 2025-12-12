import { getNOAAGridpoint } from '../../noaa/noaa';
import { normalizeForecast } from './normalize';
import { getNDFDSnowfall } from '../../noaa/ndfd';
import type { Resort } from '../../data/michiganResorts';

export async function getFreshForecast(resort: Resort) {
	const grid = await getNOAAGridpoint(resort.lat, resort.lon);

	let snow24h = 0;
	let snow48h = 0;
	let source: 'ndfd' | 'ndfd-failed' = 'ndfd';

	try {
		const ndfd = await getNDFDSnowfall(resort.lat, resort.lon);
		if (ndfd.snow24h == null || ndfd.snow48h == null) throw new Error('NDFD returned null totals');

		snow24h = ndfd.snow24h;
		snow48h = ndfd.snow48h;
	} catch (err) {
		console.log('[NDFD] failed:', String(err));
		source = 'ndfd-failed';
	}

	const normalized = normalizeForecast({ resort, grid, snow24h, snow48h } as any);
	return { ...normalized, _source: source };
}
