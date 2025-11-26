import { RESORTS } from '../../data/michiganResorts';
import { getFreshForecast } from './singleForecast';

export async function getMultiForecast() {
	const result: Record<string, any> = {};

	for (const resort of RESORTS) {
		console.log('Fetching:', resort.id);

		try {
			const forecast = await getFreshForecast(resort);
			result[resort.id] = forecast;
		} catch (err) {
			console.error('Failed on', resort.id, err);
			result[resort.id] = { error: true };
		}
	}

	return result;
}
