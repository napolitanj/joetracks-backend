/**
 * Fill in gridId / gridX / gridY for every resort in src/data/michiganResorts.ts.
 *
 * NWS forecast grid cells are fixed for a coordinate, so looking them up once
 * and storing them removes a /points request from every forecast refresh.
 * Run this after adding a resort:
 *
 *   npm run seed:grids
 *
 * Resorts that already have a gridId are left alone.
 */
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../src/data/michiganResorts.ts', import.meta.url);
const UA = 'joetracks.com (contact@joetracks.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const source = await readFile(FILE, 'utf8');

const blocks = [...source.matchAll(/\{\s*\n\s*id: '([a-z0-9-]+)',[\s\S]*?lon: (-?[\d.]+),\s*\n\s*\}/g)];
const needed = blocks.filter((b) => !b[0].includes('gridId'));

if (needed.length === 0) {
	console.log(`All ${blocks.length} resorts already have grid references. Nothing to do.`);
	process.exit(0);
}

console.log(`Looking up ${needed.length} of ${blocks.length} resorts...`);

let updated = source;
let failures = 0;

for (const block of needed) {
	const [full, id, lon] = block;
	const lat = /lat: (-?[\d.]+)/.exec(full)?.[1];

	try {
		const res = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers: { 'User-Agent': UA } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const { gridId, gridX, gridY } = (await res.json()).properties;
		const indent = /\n(\t+)lon:/.exec(full)?.[1] ?? '\t\t';

		const replacement = full.replace(
			/(\n\t+lon: -?[\d.]+,)/,
			`$1\n${indent}gridId: '${gridId}',\n${indent}gridX: ${gridX},\n${indent}gridY: ${gridY},`
		);

		updated = updated.replace(full, replacement);
		console.log(`  ${id} -> ${gridId} ${gridX},${gridY}`);
	} catch (err) {
		failures++;
		console.error(`  ${id} FAILED: ${err.message}`);
	}

	await sleep(150);
}

await writeFile(FILE, updated, 'utf8');
console.log(`\nDone. ${needed.length - failures} updated, ${failures} failed.`);
