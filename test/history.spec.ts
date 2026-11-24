import { describe, it, expect } from 'vitest';
import { recordDepths, depthChange } from '../src/services/forecast/history';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-01-15T11:00:00Z');

describe('recordDepths', () => {
	it('appends a reading per resort', () => {
		const out = recordDepths({}, { boyne: 12 }, NOW);
		expect(out.boyne).toEqual([{ t: NOW, d: 12 }]);
	});

	it('skips resorts whose depth lookup returned nothing', () => {
		const out = recordDepths({}, { boyne: 12, bohemia: null }, NOW);
		expect(out.boyne).toHaveLength(1);
		expect(out.bohemia).toBeUndefined();
	});

	it('keeps the series bounded as runs accumulate', () => {
		let history = {};
		for (let i = 0; i < 20; i++) {
			history = recordDepths(history, { boyne: i }, NOW + i * 12 * HOUR);
		}
		expect((history as any).boyne.length).toBeLessThanOrEqual(8);
		expect((history as any).boyne.at(-1).d).toBe(19);
	});
});

describe('depthChange', () => {
	const series = [
		{ t: NOW - 48 * HOUR, d: 10 },
		{ t: NOW - 36 * HOUR, d: 13 },
		{ t: NOW - 24 * HOUR, d: 16 },
		{ t: NOW - 12 * HOUR, d: 19 },
		{ t: NOW, d: 22 },
	];

	it('measures 24 and 48 hour change against the right readings', () => {
		expect(depthChange(series, 24, NOW)).toBe(6);
		expect(depthChange(series, 48, NOW)).toBe(12);
	});

	it('reports a loss as a negative number', () => {
		const melting = [
			{ t: NOW - 24 * HOUR, d: 20 },
			{ t: NOW, d: 15 },
		];
		expect(depthChange(melting, 24, NOW)).toBe(-5);
	});

	it('returns null rather than zero when there is no history yet', () => {
		expect(depthChange(undefined, 24, NOW)).toBeNull();
		expect(depthChange([{ t: NOW, d: 12 }], 24, NOW)).toBeNull();
	});

	it('refuses to compare against a reading too far from the window', () => {
		const sparse = [
			{ t: NOW - 96 * HOUR, d: 5 },
			{ t: NOW, d: 20 },
		];
		expect(depthChange(sparse, 24, NOW)).toBeNull();
	});

	it('refuses when the latest reading is itself stale', () => {
		const stale = [
			{ t: NOW - 72 * HOUR, d: 10 },
			{ t: NOW - 48 * HOUR, d: 14 },
		];
		expect(depthChange(stale, 24, NOW)).toBeNull();
	});
});
