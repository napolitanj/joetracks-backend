export function normalizeForecast(input: any) {
	return {
		resort: input.resort,
		grid: input.grid,
		snow24h: input.snow24h ?? 0,
		snow48h: input.snow48h ?? 0,
		_source: input._source ?? null,
		links: {
			nwsPage: `https://forecast.weather.gov/MapClick.php?lat=${input.resort.lat}&lon=${input.resort.lon}`,
			forecast: input.grid?.forecastUrl ?? null,
			hourly: input.grid?.forecastHourlyUrl ?? null,
		},
	};
}
