import { describe, it, expect } from 'vitest';
import { normalizeForecast } from '../src/services/forecast/normalize';
import type { Resort } from '../src/data/michiganResorts';

/**
 * These tests exist because of a real incident.
 *
 * The deployed worker returned `snow48h`. A later refactor renamed the field
 * to `snow72h` and nothing failed, because nothing was checking. The frontend
 * reads `fc.snow48h`, so the 48 hour column would have gone blank for every
 * resort on the next deploy, silently, in a month when every value reads 0.
 *
 * Anything asserted below is consumed by src/components/pages/MichiganSkiTracker.tsx.
 * If a test here fails, the live table breaks. Update the page first.
 */

const resort: Resort = {
	id: 'boyne-mountain',
	name: 'Boyne Mountain',
	region: 'Northern LP',
	lat: 45.164,
	lon: -84.93,
	gridId: 'APX',
	gridX: 50,
	gridY: 67,
};

const conditions = {
	snow24h: 4.2,
	snow48h: 7.5,
	tempMaxF: 31,
	tempMinF: 18,
	windMph: 12,
	windGustMph: 28,
	rainRisk: false,
	thawRisk: false,
};

const build = () =>
	normalizeForecast({
		resort,
		grid: { gridId: 'APX', gridX: 50, gridY: 67 },
		conditions,
		updateTime: '2026-11-24T15:38:45+00:00',
	});

describe('ski forecast response contract', () => {
	it('exposes the snow fields the tracker table reads', () => {
		const out = build();
		expect(out).toHaveProperty('snow24h');
		expect(out).toHaveProperty('snow48h');
		expect(typeof out.snow24h).toBe('number');
		expect(typeof out.snow48h).toBe('number');
	});

	it('does not reintroduce snow72h, which the frontend has never read', () => {
		expect(build()).not.toHaveProperty('snow72h');
	});

	it('exposes links.nwsPage, used for the resort link in each row', () => {
		const out = build();
		expect(out.links?.nwsPage).toContain('forecast.weather.gov');
		expect(out.links.nwsPage).toContain(String(resort.lat));
		expect(out.links.nwsPage).toContain(String(resort.lon));
	});

	it('carries the resort through, since the row renders resort.name', () => {
		expect(build().resort.name).toBe('Boyne Mountain');
	});

	it('exposes the additive fields the frontend can adopt without a backend deploy', () => {
		const out = build();
		for (const key of ['tempMaxF', 'tempMinF', 'windMph', 'windGustMph', 'rainRisk', 'thawRisk']) {
			expect(out).toHaveProperty(key);
		}
	});
});
