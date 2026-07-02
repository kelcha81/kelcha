import { getHistoricalRates } from 'dukascopy-node';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---- Configuration ----------------------------------------------------------
// CLI: `node download.js <symbol> [instrumentCode] [from] [to]`
//   forex:  node download.js gbpjpy
//   index:  node download.js us30 usa30idxusd
//   range:  node download.js eurusd eurusd 2024-01-01 2024-04-01
//
// Downloads M1 candles month-by-month (one request per month) rather than as a
// single multi-year request: the big request is flaky and fails as a whole,
// whereas per-month requests are small, fast, and independently retried. Emits
// `PROGRESS i/total <month>` lines the Data Manager surfaces as a progress bar.
const SYMBOL = (process.argv[2] || process.env.INSTRUMENT || 'eurusd').toLowerCase();
const INSTRUMENT_CODE = (process.argv[3] || process.env.INSTRUMENT_CODE || SYMBOL).toLowerCase();
const TIMEFRAME = 'm1';
const FROM = process.argv[4] || '2022-01-01';
const TO = process.argv[5] || '2025-12-31';
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, `${SYMBOL}-${TIMEFRAME}-${FROM}-to-${TO}.json`);
// Persisting the dukascopy tick cache (DUKASCOPY_CACHE_DIR on a bucket in the
// daily Job) makes re-pulls incremental — only new days are fetched.
const CACHE_DIR = process.env.DUKASCOPY_CACHE_DIR || join(OUTPUT_DIR, '.cache');

/** Inclusive-start, exclusive-end month windows spanning [from, to). */
function monthRanges(from, to) {
  const out = [];
  let d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d < end) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    out.push({
      from: new Date(d),
      to: next < end ? next : end,
      label: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    });
    d = next;
  }
  return out;
}

// How many month requests to run at once. Sequential month-by-month is reliable
// but slow (latency stacks); a handful in parallel cuts wall-clock ~Nx. On the
// cloud Job the dukascopy tick cache lives on a gcsfuse mount, and too many
// concurrent writers there triggers 503 / deadline-exceeded on the mount that
// surface as a month's "Unknown error"; keep the default modest. Tune via env.
const CONCURRENCY = Number(process.env.ICT_DL_CONCURRENCY) || 2;

// Returns the month's rows on success, or null after exhausting its own retries.
// A single failed month must NOT throw here — one flaky month should not abort
// the whole symbol; main() gathers failures and retries them sequentially.
async function fetchMonth(range) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const rows = await getHistoricalRates({
        instrument: INSTRUMENT_CODE,
        dates: { from: range.from, to: range.to },
        timeframe: TIMEFRAME,
        format: 'json',
        useCache: true,
        cacheFolderPath: CACHE_DIR,
        retryCount: 5,
        retryOnEmpty: false
      });
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      if (attempt === 5) {
        console.warn(`  ${range.label}: ${err?.message ?? err} — giving up this pass`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return null;
}

async function main() {
  console.log(`Downloading ${SYMBOL.toUpperCase()} (${INSTRUMENT_CODE}) ${TIMEFRAME} ${FROM}..${TO} (x${CONCURRENCY})`);
  await mkdir(OUTPUT_DIR, { recursive: true });

  const months = monthRanges(FROM, TO);
  const results = new Array(months.length);

  // Worker pool: each worker pulls the next month index until all are done.
  let nextIdx = 0;
  let completed = 0;
  const worker = async () => {
    for (;;) {
      const i = nextIdx++;
      if (i >= months.length) return;
      const rows = await fetchMonth(months[i]);
      results[i] = rows;
      completed += 1;
      console.log(`PROGRESS ${completed}/${months.length} ${months[i].label} (${rows ? '+' + rows.length : 'FAIL — will retry'})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, months.length) }, worker));

  // Sequential retry pass: months that failed the concurrent pass are almost
  // always victims of load (gcsfuse/network contention peaks when many months
  // download at once). Retrying them one-at-a-time clears it; only if a month
  // still fails after this do we abort (a real gap would corrupt the series).
  const failedIdx = months.map((_, i) => i).filter((i) => results[i] == null);
  if (failedIdx.length) {
    console.log(`Retrying ${failedIdx.length} month(s) sequentially: ${failedIdx.map((i) => months[i].label).join(', ')}`);
    for (const i of failedIdx) {
      results[i] = await fetchMonth(months[i]);
      console.log(`RETRY ${months[i].label} (${results[i] ? '+' + results[i].length : 'still failing'})`);
    }
  }
  const stillFailed = months.filter((_, i) => results[i] == null).map((m) => m.label);
  if (stillFailed.length) throw new Error(`months failed after retries: ${stillFailed.join(', ')}`);

  const all = [];
  for (const rows of results) {
    for (const c of rows ?? []) {
      all.push({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    }
  }

  // Sort + dedupe (month boundaries can repeat a single edge candle).
  all.sort((a, b) => a.timestamp - b.timestamp);
  const out = [];
  let last = -1;
  for (const c of all) {
    if (c.timestamp !== last) {
      out.push(c);
      last = c.timestamp;
    }
  }

  await writeFile(OUTPUT_FILE, JSON.stringify(out), 'utf8');
  console.log(`Done. ${out.length.toLocaleString()} candles -> ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error('Download failed:', err?.message ?? err);
  process.exitCode = 1;
});
