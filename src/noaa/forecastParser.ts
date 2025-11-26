export function parseSnowFromForecast(daily: any) {
	const periods = daily?.properties?.periods;
	if (!periods) return { snow24h: 0, snow72h: 0 };

	const now = new Date().getTime();
	const h24 = now + 24 * 60 * 60 * 1000;
	const h72 = now + 72 * 60 * 60 * 1000;

	let snow24 = 0;
	let snow72 = 0;

	for (const p of periods) {
		const start = new Date(p.startTime).getTime();
		if (start > h72) break;

		const text = p.detailedForecast ?? '';

		// single amount e.g. "3 inches possible"
		const single = text.match(/new snow accumulation of around (\d+) inches/i);
		if (single) {
			const v = parseFloat(single[1]);
			if (start <= h24) snow24 += v;
			snow72 += v;
			continue;
		}

		// range e.g. "3 to 7 inches"
		const range = text.match(/new snow accumulation of (\d+) to (\d+) inches/i);
		if (range) {
			const avg = (parseFloat(range[1]) + parseFloat(range[2])) / 2;
			if (start <= h24) snow24 += avg;
			snow72 += avg;
			continue;
		}

		// less than half an inch
		const lessHalf = text.match(/less than half an inch/i);
		if (lessHalf) {
			if (start <= h24) snow24 += 0.25;
			snow72 += 0.25;
			continue;
		}

		// less than one inch
		const lessOne = text.match(/less than an inch/i);
		if (lessOne) {
			if (start <= h24) snow24 += 0.5;
			snow72 += 0.5;
			continue;
		}
	}

	return {
		snow24h: Math.round(snow24 * 10) / 10,
		snow72h: Math.round(snow72 * 10) / 10,
	};
}
