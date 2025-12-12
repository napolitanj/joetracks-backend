// src/noaa/ndfd.ts
//
// NDFD DWML XML → 24h / 48h snow totals from:
// <precipitation type="snow" units="inches" time-layout="..."><value>...</value>...</precipitation>
// and its matching <time-layout> with <layout-key>...

export type NdfdSnow = {
	snow24h: number | null;
	snow48h: number | null;
};

const NDFD_BASE = 'https://digital.weather.gov/xml/sample_products/browser_interface/ndfdXMLclient.php';

function round1(x: number) {
	return Math.round(x * 10) / 10;
}

function getAttr(tagOpen: string, attr: string): string | null {
	const m = tagOpen.match(new RegExp(`${attr}="([^"]+)"`, 'i'));
	return m ? m[1] : null;
}

function extractFirstTagBlock(xml: string, tag: string, predicate?: (openTag: string) => boolean) {
	// Finds first <tag ...> ... </tag> (non-nested assumption is OK for DWML sections we use)
	const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'ig');
	let match: RegExpExecArray | null;
	while ((match = re.exec(xml))) {
		const block = match[0];
		const open = block.match(new RegExp(`<${tag}\\b[^>]*>`, 'i'))?.[0] ?? '';
		if (!predicate || predicate(open)) return { block, open };
	}
	return null;
}

function extractAll(xml: string, re: RegExp): string[] {
	const out: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(xml))) out.push(m[1]);
	return out;
}

export async function getNDFDSnowfall(lat: number, lon: number): Promise<NdfdSnow> {
	const url = `${NDFD_BASE}?lat=${lat}&lon=${lon}` + `&product=time-series&snow=snowamt&Unit=e`;

	const resp = await fetch(url, {
		headers: { 'User-Agent': 'joetracks.com (contact@joetracks.com)' },
	});

	if (!resp.ok) throw new Error(`NDFD API failed: ${resp.status}`);

	const xml = await resp.text();

	// 1) Find the snowfall precipitation block
	const snow = extractFirstTagBlock(xml, 'precipitation', (open) => {
		return (getAttr(open, 'type') || '').toLowerCase() === 'snow';
	});

	if (!snow) return { snow24h: null, snow48h: null };

	const timeLayoutKey = getAttr(snow.open, 'time-layout');
	if (!timeLayoutKey) return { snow24h: null, snow48h: null };

	// 2) Values inside snow block
	const snowValsStr = extractAll(snow.block, /<value>([^<]*)<\/value>/gi);
	const snowValues = snowValsStr.map((s) => {
		const n = parseFloat(s.trim());
		return Number.isFinite(n) ? n : 0;
	});

	// 3) Find the matching time-layout block by layout-key
	const tlRe = /<time-layout\b[^>]*>[\s\S]*?<\/time-layout>/gi;
	let timeLayoutBlock: string | null = null;

	let tlMatch: RegExpExecArray | null;
	while ((tlMatch = tlRe.exec(xml))) {
		const block = tlMatch[0];
		const key = block.match(/<layout-key>([^<]+)<\/layout-key>/i)?.[1]?.trim();
		if (key === timeLayoutKey) {
			timeLayoutBlock = block;
			break;
		}
	}

	if (!timeLayoutBlock) return { snow24h: null, snow48h: null };

	// 4) Start times for THAT layout
	const timesStr = extractAll(timeLayoutBlock, /<start-valid-time>([^<]+)<\/start-valid-time>/gi);
	const times = timesStr.map((s) => Date.parse(s.trim())).filter((t) => !Number.isNaN(t));

	const now = Date.now();
	const h24 = now + 24 * 60 * 60 * 1000;
	const h48 = now + 48 * 60 * 60 * 1000;

	let sum24 = 0;
	let sum48 = 0;

	for (let i = 0; i < times.length && i < snowValues.length; i++) {
		const t = times[i];
		const v = snowValues[i];

		if (t <= now) continue;

		if (t <= h24) sum24 += v;
		if (t <= h48) sum48 += v;
	}

	return {
		snow24h: round1(sum24),
		snow48h: round1(sum48),
	};
}
