export async function getNOAAGridpoint(lat: number, lon: number) {
	const url = `https://api.weather.gov/points/${lat},${lon}`;

	const resp = await fetch(url, {
		headers: { 'User-Agent': 'joetracks.com (contact@joetracks.com)' },
	});

	if (!resp.ok) {
		throw new Error(`NOAA points API failed: ${resp.status}`);
	}

	const data = await resp.json();

	return {
		gridId: data.properties.gridId,
		gridX: data.properties.gridX,
		gridY: data.properties.gridY,
		forecastUrl: data.properties.forecast,
		forecastHourlyUrl: data.properties.forecastHourly,
	};
}

export async function getNOAAForecast(gridId: string, gridX: number, gridY: number) {
	const url = `https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}/forecast`;

	const resp = await fetch(url, {
		headers: { 'User-Agent': 'joetracks.com (contact@joetracks.com)' },
	});

	if (!resp.ok) {
		throw new Error(`NOAA forecast API failed: ${resp.status}`);
	}

	return await resp.json();
}
