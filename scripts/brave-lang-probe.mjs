/**
 * Brave search_lang probe — empirically resolve the correct search_lang code.
 *
 * Sources conflict on whether Brave wants `ja` or `jp` for Japanese, and a wrong
 * code returns HTTP 422. This hits the LIVE Brave web-search endpoint with the
 * exact 魔法少女 regression query under several candidate codes and prints, per
 * code: HTTP status + the top result hostnames. The right code is the one that
 * returns 200 AND Japanese hosts (ja.* / .jp), no zh.*.
 *
 * Run (key from your extension Options → Brave API key):
 *   BRAVE_API_KEY=<your-key> node scripts/brave-lang-probe.mjs
 * or:
 *   node scripts/brave-lang-probe.mjs <your-key>
 *
 * Read-only: no writes, just GETs against Brave. Uses YOUR metered key.
 */

const key = process.env.BRAVE_API_KEY || process.argv[2];
if (!key) {
  console.error('No key. Run: BRAVE_API_KEY=<key> node scripts/brave-lang-probe.mjs');
  process.exit(1);
}

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const QUERY = '魔法少女'; // identical in JA and ZH kanji — the ambiguity that broke locale detection
// Brave's Japanese search_lang is `jp` (ja → 422). search_lang=jp alone still
// returned Chinese, so probe country / ui_lang combos to find what pins JP results.
const CANDIDATES = [
  { searchLang: 'jp' },
  { country: 'JP' },
  { searchLang: 'jp', country: 'JP' },
  { searchLang: 'jp', country: 'JP', uiLang: 'ja-JP' },
  { searchLang: 'jp', uiLang: 'ja-JP' },
];

async function probe(opts) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', QUERY);
  url.searchParams.set('count', '5');
  url.searchParams.set('result_filter', 'web');
  if (opts.searchLang) url.searchParams.set('search_lang', opts.searchLang);
  if (opts.country) url.searchParams.set('country', opts.country);
  if (opts.uiLang) url.searchParams.set('ui_lang', opts.uiLang);

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
  });
  const label = `lang=${opts.searchLang ?? '-'} country=${opts.country ?? '-'} ui=${opts.uiLang ?? '-'}`;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.log(`search_lang=${label.padEnd(34)} → HTTP ${res.status}  ✗  body: ${JSON.stringify(body).slice(0, 200)}`);
    return;
  }
  const data = await res.json();
  const hosts = (data?.web?.results ?? [])
    .map((r) => r?.meta_url?.hostname ?? '')
    .filter(Boolean)
    .slice(0, 5);
  const ja = hosts.some((h) => /(^|\.)ja\./.test(h) || /\.jp$/.test(h));
  const zh = hosts.some((h) => /(^|\.)zh\./.test(h) || h.endsWith('.cn'));
  const verdict = ja && !zh ? '✓ JAPANESE' : zh ? '✗ chinese leak' : '? mixed/other';
  console.log(`search_lang=${label.padEnd(34)} → HTTP 200  ${verdict}  hosts: ${hosts.join(', ')}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Probing Brave search_lang for q="${QUERY}"  (Free plan = 1 req/s, spacing 1.6s)\n`);
for (const c of CANDIDATES) {
  try {
    await probe(c);
  } catch (e) {
    console.log(`search_lang=${c ?? '(none)'} → ERROR ${e?.message ?? e}`);
  }
  await sleep(1600); // stay under the Free-plan 1 req/s limit so each code gets a real status
}
console.log('\nPick the code that shows "✓ JAPANESE". I will set BRAVE_SEARCH_LANG[Japanese] to it.');
