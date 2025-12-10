function extractSnowInches(text: string): number {
  const t = text.toLowerCase();

  const wordToNum: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    half: 0.5,
  };

  // ---- WORD-BASED SPECIAL CASES ----

  // "new snow accumulation of around one inch possible"
  if (t.includes('new snow accumulation of around one inch')) return 1;

  // "new snow accumulation of around an inch possible"
  if (t.includes('new snow accumulation of around an inch')) return 1;

  // "less than half an inch"
  if (t.includes('less than half an inch')) return 0.25;

  // "less than an inch" / "less than one inch"
  if (t.includes('less than an inch') || t.includes('less than one inch')) return 0.5;

  // generic word-based: "new snow accumulation of around one/half inch"
  let m = t.match(/new snow accumulation of (?:around )?(one|two|three|four|five|six|seven|eight|nine|ten|half) inch/);
  if (m && wordToNum[m[1]]) {
    return wordToNum[m[1]];
  }

  // ---- NUMERIC PATTERNS ----

  // "new snow accumulation of X to Y inches possible" (but allow junk between)
  m = t.match(/new snow accumulation of[^0-9]*?(\d+(\.\d+)?) to (\d+(\.\d+)?) inches?/);
  if (m) {
    const lo = parseFloat(m[1]);
    const hi = parseFloat(m[3]);
    return (lo + hi) / 2;
  }

  // "new snow accumulation of around X inches possible"
  m = t.match(/new snow accumulation of around (\d+(\.\d+)?) inches?/);
  if (m) {
    return parseFloat(m[1]);
  }

  // "new snow accumulation of up to X inches possible"
  m = t.match(/new snow accumulation of up to (\d+(\.\d+)?) inches?/);
  if (m) {
    const hi = parseFloat(m[1]);
    return hi * 0.7; // heuristic: ~70% of "up to"
  }

  // "new snow accumulation of X inches possible"
  m = t.match(/new snow accumulation of (\d+(\.\d+)?) inches?/);
  if (m) {
    return parseFloat(m[1]);
  }

    // Fallback: "X to Y inches possible" anywhere in the text
  m = t.match(/(\d+(\.\d+)?) to (\d+(\.\d+)?) inches? possible/);
  if (m) {
    const lo = parseFloat(m[1]);
    const hi = parseFloat(m[3]);
    return (lo + hi) / 2;
  }

  return 0;
}

export function parseSnowFromForecast(daily: any) {
  const periods = daily?.properties?.periods;
  if (!periods) return { snow24h: 0, snow72h: 0 };

  const now = Date.now();
  const h24 = now + 24 * 60 * 60 * 1000;
  const h72 = now + 72 * 60 * 60 * 1000;

  let snow24 = 0;
  let snow72 = 0;

  for (const p of periods) {
    const start = new Date(p.startTime).getTime();
    if (start > h72) break;

    const text = p.detailedForecast ?? "";
    const inches = extractSnowInches(text);

    if (!inches) {
      console.log(`[SNOW] ${p.name} (${p.startTime}) -> 0" | no match`);
      continue;
    }

    const in24 = start <= h24;

    console.log(
      `[SNOW] ${p.name} (${p.startTime}) -> +${inches}" | in24=${in24} | text="${text.slice(
        0,
        120
      )}..."`
    );

    if (in24) snow24 += inches;
    snow72 += inches;
  }

  const snow24h = Math.round(snow24 * 10) / 10;
  const snow72h = Math.round(snow72 * 10) / 10;

  console.log(`[SNOW TOTALS] 24h=${snow24h}", 72h=${snow72h}"`);

  return { snow24h, snow72h };
}
