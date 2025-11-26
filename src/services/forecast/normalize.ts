export function normalizeForecast(input: any) {
	return {
		resort: input.resort,
		grid: input.grid,
		snow24h: input.snow24h ?? 0,
		snow72h: input.snow72h ?? 0,
		links: {
			nwsPage: `https://forecast.weather.gov/MapClick.php?lat=${input.resort.lat}&lon=${input.resort.lon}`,
			forecast: input.grid?.forecastUrl ?? null,
			hourly: input.grid?.forecastHourlyUrl ?? null,
		},
	};
}
