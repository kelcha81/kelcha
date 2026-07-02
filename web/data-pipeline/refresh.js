import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Daily candle refresh (Cloud Run Job). For each symbol, re-pull M1 from
// Dukascopy up to "yesterday" and re-package into the candles bucket (mounted at
// ../public/data). The download's exclusive UTC-midnight TO = today's date, so
// today's still-forming NY session is excluded and the last complete daily bar
// (NY sessions close 5pm) is yesterday's — i.e. backtests run up to the previous
// day. dukascopy caching (DUKASCOPY_CACHE_DIR, persisted on the bucket) keeps
// each run incremental.

const HERE = dirname(fileURLToPath(import.meta.url));

// Mirror of web/src/lib/symbols.ts (symbol → dukascopy instrument + precision).
const SYMBOLS = [
  { symbol: 'eurusd', instrument: 'eurusd', precision: 5 },
  { symbol: 'gbpjpy', instrument: 'gbpjpy', precision: 3 },
  { symbol: 'us30', instrument: 'usa30idxusd', precision: 1 },
  { symbol: 'nas100', instrument: 'usatechidxusd', precision: 1 },
  { symbol: 'us500', instrument: 'usa500idxusd', precision: 1 },
  { symbol: 'ger40', instrument: 'deuidxeur', precision: 1 }
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

async function main() {
  console.log(`Candle refresh ${FROM}..${TO} for ${SYMBOLS.length} symbols`);
  let failed = 0;
  for (const s of SYMBOLS) {
    try {
      await run('download.js', [s.symbol, s.instrument, FROM, TO]);
      await run('package-data.js', [s.symbol, String(s.precision)]);
      console.log(`[${s.symbol}] refreshed`);
    } catch (e) {
      failed++;
      console.error(`[${s.symbol}] FAILED:`, e?.message ?? e);
    }
  }
  console.log(`Refresh done — ${SYMBOLS.length - failed}/${SYMBOLS.length} ok`);
  if (failed) process.exitCode = 1;
}

main();
