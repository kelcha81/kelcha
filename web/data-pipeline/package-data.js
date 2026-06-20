import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { aggregateCandles } from './aggregate.js';

// Packages a symbol's full history into browser-servable files for IndexedDB
// seeding:  public/data/<symbol>/{ manifest.json, m1/<YYYY-MM>.json, <tf>.json... }
//   node package-data.js eurusd
//
// M1 -> monthly chunks. Higher timeframes recomputed from M1:
//   m5/m15/h1/h4/d1 via fixed-minute buckets (aggregateCandles, session-aligned)
//   w1 (weekly, Monday-anchored) and mo1 (monthly) via calendar buckets.

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, 'data');

const TZ = 'America/New_York';
const SESSION = { timeZone: TZ, offsetMinutes: -17 * 60 }; // 5pm NY rollover
const FIXED_TIMEFRAMES = { m5: 5, m15: 15, h1: 60, h4: 240, d1: 1440 };

const SYMBOL = (process.argv[2] || 'eurusd').toLowerCase();
const OUT_DIR = join(HERE, '..', 'public', 'data', SYMBOL);
// Optional precision arg (indices need 1); else infer from the symbol.
const pricePrecision = process.argv[3] ? Number(process.argv[3]) : SYMBOL.endsWith('jpy') ? 3 : 5;

// ---- NY-local calendar helpers (hour-cached DST-aware offset) ----------------
const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});
const HOUR_MS = 3600 * 1000;
const offsetCache = new Map();
function nyOffset(ts) {
  const key = Math.floor(ts / HOUR_MS);
  let off = offsetCache.get(key);
  if (off === undefined) {
    const tr = key * HOUR_MS;
    const p = {};
    for (const part of dtf.formatToParts(tr)) if (part.type !== 'literal') p[part.type] = part.value;
    off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - tr;
    offsetCache.set(key, off);
  }
  return off;
}
/** A Date whose UTC fields read as the NY wall-clock for `ts`. */
function nyDate(ts) {
  return new Date(ts + nyOffset(ts));
}
function monthKey(ts) {
  const d = nyDate(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Monday-anchored week (Sunday's session belongs to the upcoming Monday week). */
function weekKey(ts) {
  const d = nyDate(ts);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const toMonday = dow === 0 ? 1 : -(dow - 1);
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + toMonday));
  return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}`;
}

/** Aggregate M1 into bars grouped by a calendar key (variable-length periods). */
function aggregateCalendar(m1, keyFn) {
  const out = [];
  let cur = null;
  let curKey = null;
  for (const c of m1) {
    const k = keyFn(c.timestamp);
    if (k !== curKey) {
      if (cur) out.push(cur);
      curKey = k;
      cur = { timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      if (c.high > cur.high) cur.high = c.high;
      if (c.low < cur.low) cur.low = c.low;
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function findM1File() {
  const files = await readdir(DATA_DIR);
  const re = new RegExp(`^${SYMBOL}-m1-.*\\.json$`, 'i');
  const match = files.find((f) => re.test(f));
  if (!match) throw new Error(`No ${SYMBOL}-m1-*.json found in ${DATA_DIR}. Download it first.`);
  return join(DATA_DIR, match);
}

function chunkMonth(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const m1Path = await findM1File();
  console.log(`[${SYMBOL}] reading ${m1Path} ...`);
  const m1 = JSON.parse(await readFile(m1Path, 'utf8'));
  console.log(`[${SYMBOL}] ${m1.length.toLocaleString()} M1 candles, precision ${pricePrecision}`);

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(join(OUT_DIR, 'm1'), { recursive: true });

  // --- M1 monthly chunks (UTC month, just for file splitting) ---
  const chunks = new Map();
  for (const c of m1) {
    const k = chunkMonth(c.timestamp);
    let arr = chunks.get(k);
    if (!arr) chunks.set(k, (arr = []));
    arr.push(c);
  }
  const chunkNames = [];
  for (const [k, arr] of [...chunks.entries()].sort()) {
    const name = `m1/${k}.json`;
    await writeFile(join(OUT_DIR, name), JSON.stringify(arr), 'utf8');
    chunkNames.push(name);
  }
  console.log(`[${SYMBOL}] wrote ${chunkNames.length} M1 monthly chunks`);

  // --- Aggregates ---
  const timeframes = { m1: { chunks: chunkNames } };
  const datasets = {};
  for (const [tf, minutes] of Object.entries(FIXED_TIMEFRAMES)) {
    datasets[tf] = aggregateCandles(m1, minutes, SESSION);
  }
  datasets.w1 = aggregateCalendar(m1, weekKey);
  datasets.mo1 = aggregateCalendar(m1, monthKey);

  for (const [tf, candles] of Object.entries(datasets)) {
    await writeFile(join(OUT_DIR, `${tf}.json`), JSON.stringify(candles), 'utf8');
    timeframes[tf] = { file: `${tf}.json` };
    console.log(`[${SYMBOL}]   ${tf.padEnd(3)} ${candles.length.toLocaleString().padStart(8)} candles`);
  }

  const manifest = { symbol: SYMBOL, pricePrecision, timeframes };
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[${SYMBOL}] manifest written -> public/data/${SYMBOL}/manifest.json`);
}

main().catch((err) => {
  console.error('package-data failed:', err?.message ?? err);
  process.exitCode = 1;
});
