import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { uploadSymbol } from './upload.js';

// Daily candle refresh (Cloud Run Job). For each symbol, re-pull M1 from
// Dukascopy up to "yesterday", re-package to LOCAL disk, verify, then publish to
// the candles bucket via the GCS SDK (durable, atomic, manifest-last). The
// download's exclusive UTC-midnight TO = today's date, so today's still-forming
// NY session is excluded and the last complete daily bar (NY sessions close 5pm)
// is yesterday's — i.e. backtests run up to the previous day. dukascopy caching
// (DUKASCOPY_CACHE_DIR, persisted on the bucket) keeps each run incremental.
//
// PACKAGE_OUT_DIR points the packager at local container disk; GCP_CANDLES_BUCKET
// is the publish target. If GCP_CANDLES_BUCKET is unset (local dev), packaging
// writes straight to public/data and the upload step is skipped.

const HERE = dirname(fileURLToPath(import.meta.url));

// Mirror of web/src/lib/symbols.ts (symbol → dukascopy instrument + precision).
const SYMBOLS = [
  { symbol: 'eurusd', instrument: 'eurusd', precision: 5 },
  { symbol: 'gbpusd', instrument: 'gbpusd', precision: 5 },
  { symbol: 'usdchf', instrument: 'usdchf', precision: 5 },
  { symbol: 'eurgbp', instrument: 'eurgbp', precision: 5 },
  { symbol: 'gbpjpy', instrument: 'gbpjpy', precision: 3 },
  { symbol: 'us30', instrument: 'usa30idxusd', precision: 1 },
  { symbol: 'nas100', instrument: 'usatechidxusd', precision: 1 },
  { symbol: 'us500', instrument: 'usa500idxusd', precision: 1 },
  { symbol: 'ger40', instrument: 'deuidxeur', precision: 1 },
  { symbol: 'ftse100', instrument: 'gbridxgbp', precision: 1 },
  { symbol: 'xauusd', instrument: 'xauusd', precision: 2 }
];

const FROM = process.env.REFRESH_FROM || '2022-01-01';
const TO = new Date().toISOString().slice(0, 10); // today (UTC) → data through yesterday

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: HERE, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

// Where package-data.js writes (must match its PACKAGE_OUT_DIR default).
const DATA_ROOT = process.env.PACKAGE_OUT_DIR || join(HERE, '..', 'public', 'data');
const BUCKET = process.env.GCP_CANDLES_BUCKET || '';

/**
 * Post-package verification gate. Reads the symbol's just-written manifest and
 * confirms every file it references (each tf's whole `<tf>.json` and every
 * monthly `chunk`) exists on the bucket and is non-empty. Because the packager
 * writes the manifest LAST, a manifest that points at a missing/zero-byte file
 * means the write didn't fully persist (e.g. gcsfuse dropped it) — we throw so
 * the run is marked failed and alerting fires, rather than silently publishing
 * a manifest the charts will 404 on. Returns the number of files checked.
 */
async function verifySymbol(symbol) {
  const dir = join(DATA_ROOT, symbol);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const files = [];
  for (const tf of Object.values(manifest.timeframes ?? {})) {
    if (tf.file) files.push(tf.file);
    for (const chunk of tf.chunks ?? []) files.push(chunk);
  }
  const missing = [];
  for (const rel of files) {
    try {
      const s = await stat(join(dir, rel));
      if (!s.isFile() || s.size === 0) missing.push(`${rel} (empty)`);
    } catch {
      missing.push(`${rel} (missing)`);
    }
  }
  if (missing.length) {
    throw new Error(
      `${symbol}: manifest references ${missing.length}/${files.length} unwritten files: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`
    );
  }
  return files.length;
}

async function main() {
  console.log(`Candle refresh ${FROM}..${TO} for ${SYMBOLS.length} symbols`);
  let failed = 0;
  for (const s of SYMBOLS) {
    // Retry the whole per-symbol pipeline once: the download child can be
    // killed by a transient resource spike (exit null), and re-running with the
    // warm dukascache usually succeeds. keep-last-good means a symbol that fails
    // both attempts simply keeps its previous published data.
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        await run('download.js', [s.symbol, s.instrument, FROM, TO]);
        await run('package-data.js', [s.symbol, String(s.precision)]);
        // Verify the LOCAL package is complete before it goes anywhere.
        const checked = await verifySymbol(s.symbol);
        if (BUCKET) {
          // Publish via the GCS SDK: chunks first, manifest last (atomic swap of
          // the view). A failure here leaves the previous manifest — and thus
          // the previous consistent data — untouched (keep-last-good).
          const uploaded = await uploadSymbol(s.symbol, join(DATA_ROOT, s.symbol), BUCKET);
          console.log(`[${s.symbol}] refreshed — ${checked} verified, ${uploaded} published to ${BUCKET}`);
        } else {
          console.log(`[${s.symbol}] refreshed — ${checked} files verified (no bucket; wrote ${DATA_ROOT})`);
        }
        ok = true;
      } catch (e) {
        console.error(`[${s.symbol}] attempt ${attempt}/2 failed:`, e?.message ?? e);
      }
    }
    if (!ok) failed++;
  }
  console.log(`Refresh done — ${SYMBOLS.length - failed}/${SYMBOLS.length} ok`);
  if (failed) process.exitCode = 1;
}

main();
