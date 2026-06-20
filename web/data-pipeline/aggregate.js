import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DATA_DIR = './data';

// Target timeframes to generate, keyed by output suffix -> minutes.
const TIMEFRAMES = {
  m5: 5,
  m15: 15,
  h1: 60,
  h4: 240,
  d1: 1440
};

// ---- Session / timezone configuration ---------------------------------------
// Candle boundaries are aligned to this session rather than raw UTC midnight.
//
//   timeZone        : any IANA zone (e.g. 'America/New_York', 'Europe/London',
//                     'Asia/Tokyo'), DST-aware. null => align to UTC.
//   dayBoundaryHour : the hour, IN THAT timeZone, at which the trading "day"
//                     starts. 0 = local midnight. 17 with America/New_York is
//                     the classic forex broker rollover (5pm New York close).
//
// The offset is applied to ALL timeframes so they stay mutually consistent
// (e.g. H4 sessions begin at the same boundary the day does).
const SESSION = {
  timeZone: 'America/New_York',
  dayBoundaryHour: 17
};

/**
 * Build a DST-aware resolver that returns, for a given UTC timestamp, the
 * timeZone's offset from UTC in milliseconds (localWallClock = utc + offset).
 *
 * The offset is piecewise-constant and only changes at DST transitions (which
 * fall on whole-hour UTC instants), so we cache by UTC hour: ~35k Intl lookups
 * per 4 years instead of one per candle.
 *
 * @param {string|null} timeZone IANA zone name, or null for UTC.
 * @returns {(timestamp:number)=>number} offset resolver (ms)
 */
function makeZoneOffsetResolver(timeZone) {
  if (!timeZone || timeZone === 'UTC') {
    return () => 0;
  }

  let dtf;
  try {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    throw new RangeError(`Invalid timeZone: "${timeZone}"`);
  }

  const HOUR_MS = 3600 * 1000;
  const cache = new Map(); // UTC-hour bucket -> offset ms

  return (timestamp) => {
    const key = Math.floor(timestamp / HOUR_MS);
    let offset = cache.get(key);
    if (offset === undefined) {
      const representative = key * HOUR_MS; // offset is constant across the hour
      const parts = dtf.formatToParts(representative);
      const p = {};
      for (const part of parts) {
        if (part.type !== 'literal') p[part.type] = part.value;
      }
      const asUTC = Date.UTC(
        +p.year,
        +p.month - 1,
        +p.day,
        +p.hour,
        +p.minute,
        +p.second
      );
      offset = asUTC - representative;
      cache.set(key, offset);
    }
    return offset;
  };
}

/**
 * Aggregate an array of M1 (1-minute) candles into a higher timeframe.
 *
 * Candles are grouped into fixed, session-aligned buckets of `timeframeMinutes`.
 * Buckets are computed against a configurable session so that, e.g., H1 aligns
 * to the top of the hour and D1 to the chosen day boundary. Aligned bucketing
 * (rather than naive "every N candles") keeps boundaries stable across the
 * weekend/holiday gaps in forex data.
 *
 * Assumes `m1Data` is sorted ascending by timestamp (as produced by the
 * dukascopy download).
 *
 * New candle:
 *   timestamp -> timestamp of the FIRST M1 candle in the group (raw UTC ms)
 *   open      -> open of the first M1 candle
 *   high      -> max high across the group
 *   low       -> min low across the group
 *   close     -> close of the LAST M1 candle
 *   volume    -> sum of volumes across the group
 *
 * @param {Array<{timestamp:number,open:number,high:number,low:number,close:number,volume:number}>} m1Data
 * @param {number} timeframeMinutes positive integer, e.g. 15, 60, 240, 1440
 * @param {object} [options]
 * @param {string|null} [options.timeZone=null] IANA zone for DST-aware session alignment (null = UTC)
 * @param {number} [options.offsetMinutes=0] additional fixed shift in minutes applied to the session boundary
 * @returns {Array<object>} aggregated candles
 */
export function aggregateCandles(m1Data, timeframeMinutes, options = {}) {
  if (!Array.isArray(m1Data)) {
    throw new TypeError('m1Data must be an array');
  }
  if (!Number.isInteger(timeframeMinutes) || timeframeMinutes <= 0) {
    throw new RangeError('timeframeMinutes must be a positive integer');
  }

  const { timeZone = null, offsetMinutes = 0 } = options;
  if (!Number.isFinite(offsetMinutes)) {
    throw new TypeError('options.offsetMinutes must be a finite number');
  }

  const bucketMs = timeframeMinutes * 60 * 1000;
  const offsetMs = offsetMinutes * 60 * 1000;
  const zoneOffsetAt = makeZoneOffsetResolver(timeZone);

  const result = [];
  let current = null;
  let currentBucket = null;

  for (const c of m1Data) {
    // Shift into session-local time before bucketing; the emitted candle still
    // carries the raw UTC timestamp of its first member.
    const localTs = c.timestamp + zoneOffsetAt(c.timestamp) + offsetMs;
    const bucket = Math.floor(localTs / bucketMs);

    if (bucket !== currentBucket) {
      if (current) result.push(current);
      currentBucket = bucket;
      current = {
        timestamp: c.timestamp, // first candle in the group
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      };
    } else {
      if (c.high > current.high) current.high = c.high;
      if (c.low < current.low) current.low = c.low;
      current.close = c.close; // last candle in the group so far
      current.volume += c.volume;
    }
  }

  if (current) result.push(current);
  return result;
}

/** Find the M1 source JSON in the data directory. */
async function findM1File() {
  const files = await readdir(DATA_DIR);
  const match = files.find((f) => /eurusd-m1-.*\.json$/i.test(f));
  if (!match) {
    throw new Error(
      `No M1 source file (eurusd-m1-*.json) found in ${DATA_DIR}. Run the download first.`
    );
  }
  return join(DATA_DIR, match);
}

async function main() {
  const m1Path = await findM1File();
  console.log(`Reading M1 data from ${m1Path} ...`);

  const m1Data = JSON.parse(await readFile(m1Path, 'utf8'));
  if (!Array.isArray(m1Data) || m1Data.length === 0) {
    throw new Error('M1 source file is empty or not an array.');
  }
  console.log(`Loaded ${m1Data.length.toLocaleString()} M1 candles.`);

  const sessionLabel = SESSION.timeZone
    ? `${SESSION.timeZone} @ ${SESSION.dayBoundaryHour}:00`
    : 'UTC @ 0:00';
  console.log(`Session alignment: ${sessionLabel}`);
  console.log('----------------------------------------------');

  // dayBoundaryHour shifts the boundary "earlier" so that hour becomes 0.
  const aggOptions = {
    timeZone: SESSION.timeZone,
    offsetMinutes: -SESSION.dayBoundaryHour * 60
  };

  for (const [suffix, minutes] of Object.entries(TIMEFRAMES)) {
    const aggregated = aggregateCandles(m1Data, minutes, aggOptions);
    const outPath = join(DATA_DIR, `eurusd_${suffix}.json`);
    await writeFile(outPath, JSON.stringify(aggregated), 'utf8');
    console.log(
      `${suffix.toUpperCase().padEnd(4)} (${String(minutes).padStart(4)}m): ` +
        `${aggregated.length.toLocaleString().padStart(10)} candles -> ${outPath}`
    );
  }

  console.log('----------------------------------------------');
  console.log('Aggregation complete.');
}

// Only run main() when executed directly, so the function stays importable.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Aggregation failed:', err?.message ?? err);
    process.exitCode = 1;
  });
}
