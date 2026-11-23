import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---- Configuration ----------------------------------------------------------
// CLI: `node download.js <symbol> [instrumentCode] [from] [to]`
//   forex:  node download.js gbpjpy
//   index:  node download.js nas100 NAS100_USD
//   range:  node download.js eurusd EUR_USD 2024-01-01 2024-04-01
//
// Downloads M1 midpoint candles month-by-month from the OANDA v20 REST API
// (matching TradingView's OANDA feeds). Finalized past months are cached under
// OANDA_CACHE_DIR (persisted on the GCS bucket in the daily Cloud Run Job) so
// subsequent runs only fetch the current month.
//
// Required env:
//   OANDA_API_KEY   Personal access token from OANDA (Practice or Live)
// Optional env:
//   OANDA_ENV       'practice' | 'live' (auto-detected via /v3/accounts if unset)
//   OANDA_PRICE     'M' (midpoint, default — matches TradingView), 'B', or 'A'
//   OANDA_CACHE_DIR Directory for completed monthly M1 JSON cache files
//   ICT_DL_CONCURRENCY Parallel month workers per symbol (default 2)

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTRUMENTS = JSON.parse(readFileSync(join(HERE, 'instruments.json'), 'utf8'));

const SYMBOL = (process.argv[2] || process.env.INSTRUMENT || 'eurusd').toLowerCase();
const ENTRY = INSTRUMENTS.find((s) => s.symbol === SYMBOL) ?? null;

function resolveOandaInstrument(symbol, argCode, entry) {
  if (entry?.oandaInstrument) return entry.oandaInstrument;
  if (argCode && argCode.includes('_')) return argCode.toUpperCase();
  if (/^[a-z]{6}$/i.test(symbol)) {
    return `${symbol.slice(0, 3).toUpperCase()}_${symbol.slice(3).toUpperCase()}`;
  }
  return (argCode || symbol).toUpperCase();
}

const OANDA_INSTRUMENT = resolveOandaInstrument(SYMBOL, process.argv[3] || process.env.INSTRUMENT_CODE, ENTRY);
const TIMEFRAME = 'm1';
const FROM = process.argv[4] || '2022-01-01';
const TO = process.argv[5] || '2025-12-31';
const OUTPUT_DIR = join(HERE, 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, `${SYMBOL}-${TIMEFRAME}-${FROM}-to-${TO}.json`);
const CACHE_DIR = process.env.OANDA_CACHE_DIR || join(OUTPUT_DIR, '.oandacache');
const CONCURRENCY = Math.max(1, Number(process.env.ICT_DL_CONCURRENCY) || 2);
const PRICE_CODE = (process.env.OANDA_PRICE || 'M').toUpperCase();
const PRICE_KEY = PRICE_CODE === 'B' ? 'bid' : PRICE_CODE === 'A' ? 'ask' : 'mid';
const API_KEY = (process.env.OANDA_API_KEY || '').trim();

const HOSTS = {
  practice: 'https://api-fxpractice.oanda.com',
  live: 'https://api-fxtrade.oanda.com'
};

const FALLBACK_INSTRUMENTS = {
  JP225_USD: ['JP225Y_JPY'],
  DE30_EUR: ['DE40_EUR']
};

/** Inclusive-start, exclusive-end UTC month windows spanning [from, to). */
function monthRanges(from, to) {
  const out = [];
  let d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d < end) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const isFullMonth = d.getUTCDate() === 1 && next <= end;
    out.push({
      from: new Date(d),
      to: next < end ? next : end,
      isFullMonth,
      label: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    });
    d = next;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function oandaGet(baseUrl, path) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Accept-Datetime-Format': 'UNIX'
        }
      });
    } catch (err) {
      if (attempt === 6) throw err;
      await sleep(1000 * attempt);
      continue;
    }

    if (res.ok) return res.json();

    const body = await res.text().catch(() => '');
    // Retryable throttling or transient server error
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const waitMs = Math.max(retryAfter * 1000, 1000 * 2 ** (attempt - 1));
      await sleep(Math.min(waitMs, 30000));
      continue;
    }

    const err = new Error(`OANDA HTTP ${res.status}: ${body.slice(0, 240)}`);
    err.status = res.status;
    throw err;
  }
  throw new Error('OANDA request exhausted retries');
}

/** Auto-detect whether the API key belongs to Practice or Live. */
async function resolveHost() {
  const env = (process.env.OANDA_ENV || '').toLowerCase();
  if (env === 'practice' || env === 'live') return HOSTS[env];

  for (const [name, host] of Object.entries(HOSTS)) {
    try {
      await oandaGet(host, '/v3/accounts');
      console.log(`OANDA auth verified (${name}: ${host})`);
      return host;
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) throw err;
    }
  }
  throw new Error('OANDA_API_KEY was rejected by both practice and live endpoints (HTTP 401/403).');
}

/** Resolve the exact instrument code supported by this OANDA entity (e.g. JP225_USD vs JP225Y_JPY). */
async function resolveSupportedInstrument(baseUrl, primary) {
  const candidates = [primary, ...(FALLBACK_INSTRUMENTS[primary] || [])];
  for (const code of candidates) {
    try {
      await oandaGet(baseUrl, `/v3/instruments/${encodeURIComponent(code)}/candles?granularity=M1&price=${PRICE_CODE}&count=1`);
      if (code !== primary) console.log(`Resolved ${primary} -> ${code}`);
      return code;
    } catch (err) {
      if (err?.status === 400) continue;
      throw err;
    }
  }
  throw new Error(`OANDA rejected instrument ${candidates.join(' / ')} (not available on this OANDA account)`);
}

/** Fetch one month of M1 candles via OANDA count=5000 pagination, using disk cache for past months. */
async function fetchMonth(baseUrl, instrument, range, cacheCutoffMs) {
  const cacheable = range.isFullMonth && range.to.getTime() <= cacheCutoffMs;
  const cachePath = join(CACHE_DIR, SYMBOL, `${range.label}.json`);

  if (cacheable) {
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'));
      if (Array.isArray(cached) && cached.length > 0) {
        return { rows: cached, fromCache: true };
      }
    } catch {
      /* cache miss */
    }
  }

  const endMs = range.to.getTime();
  const rows = [];
  let cursorSec = Math.floor(range.from.getTime() / 1000);
  let includeFirst = true;

  for (let page = 0; page < 25; page++) {
    const qs =
      `granularity=M1&price=${PRICE_CODE}&from=${cursorSec}&count=5000` +
      `&includeFirst=${includeFirst ? 'true' : 'false'}`;
    const data = await oandaGet(baseUrl, `/v3/instruments/${encodeURIComponent(instrument)}/candles?${qs}`);
    const batch = Array.isArray(data.candles) ? data.candles : [];
    if (batch.length === 0) break;

    let lastSec = cursorSec;
    let reachedEnd = false;
    for (const c of batch) {
      const sec = Number(c.time);
      const tsMs = Math.round(sec * 1000);
      lastSec = sec;
      if (tsMs >= endMs) {
        reachedEnd = true;
        break;
      }
      if (c.complete === false) continue;
      const ohlc = c[PRICE_KEY] || c.mid || c.bid || c.ask;
      if (!ohlc) continue;
      rows.push({
        timestamp: tsMs,
        open: Number(ohlc.o),
        high: Number(ohlc.h),
        low: Number(ohlc.l),
        close: Number(ohlc.c),
        volume: Number(c.volume || 0)
      });
    }

    if (reachedEnd || batch.length < 5000 || lastSec <= cursorSec) break;
    cursorSec = lastSec;
    includeFirst = false;
  }

  if (cacheable && rows.length > 0) {
    await mkdir(join(CACHE_DIR, SYMBOL), { recursive: true }).catch(() => {});
    await writeFile(cachePath, JSON.stringify(rows), 'utf8').catch(() => {});
  }

  return { rows, fromCache: false };
}

async function main() {
  if (!API_KEY) {
    throw new Error('OANDA_API_KEY environment variable is required.');
  }

  const baseUrl = await resolveHost();
  const instrument = await resolveSupportedInstrument(baseUrl, OANDA_INSTRUMENT);

  console.log(`Downloading ${SYMBOL.toUpperCase()} (OANDA ${instrument}, price=${PRICE_CODE}) ${TIMEFRAME} ${FROM}..${TO} (x${CONCURRENCY})`);
  await mkdir(OUTPUT_DIR, { recursive: true });

  const months = monthRanges(FROM, TO);
  const results = new Array(months.length);
  // Only cache months that ended at least 2 days before now (safely finalized).
  const cacheCutoffMs = Date.now() - 2 * 86_400_000;

  let nextIdx = 0;
  let completed = 0;
  const worker = async () => {
    for (;;) {
      const i = nextIdx++;
      if (i >= months.length) return;
      try {
        const { rows, fromCache } = await fetchMonth(baseUrl, instrument, months[i], cacheCutoffMs);
        results[i] = rows;
        completed += 1;
        console.log(`PROGRESS ${completed}/${months.length} ${months[i].label} (+${rows.length}${fromCache ? ', cached' : ''})`);
      } catch (err) {
        results[i] = null;
        completed += 1;
        console.warn(`  ${months[i].label}: ${err?.message ?? err} — will retry`);
        console.log(`PROGRESS ${completed}/${months.length} ${months[i].label} (FAIL — will retry)`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, months.length) }, worker));

  // Sequential retry pass for any transient month failures.
  const failedIdx = months.map((_, i) => i).filter((i) => results[i] == null);
  if (failedIdx.length) {
    console.log(`Retrying ${failedIdx.length} month(s) sequentially: ${failedIdx.map((i) => months[i].label).join(', ')}`);
    for (const i of failedIdx) {
      try {
        const { rows } = await fetchMonth(baseUrl, instrument, months[i], cacheCutoffMs);
        results[i] = rows;
        console.log(`RETRY ${months[i].label} (+${rows.length})`);
      } catch (err) {
        console.warn(`  RETRY ${months[i].label} failed: ${err?.message ?? err}`);
        results[i] = null;
      }
    }
  }

  const stillFailed = months.filter((_, i) => results[i] == null).map((m) => m.label);
  if (stillFailed.length) throw new Error(`months failed after retries: ${stillFailed.join(', ')}`);

  const all = [];
  for (const rows of results) {
    for (const c of rows ?? []) all.push(c);
  }

  // Sort + dedupe (month boundaries can repeat an edge candle).
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
