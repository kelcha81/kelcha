// Timezone helpers. Candle timestamps are UTC ms. Named zones (e.g.
// America/New_York) are DST-aware via Intl; 'GMT±N' is parsed directly.
// Used by (a) the ICT killzone plugin (minute-of-day session detection) and
// (b) the global display-timezone shift (formatting the head clock / scrubber).

const DAY = 86_400_000;
const offsetCache = new Map<string, number>();

function parseGmt(tz: string): number | null {
  const m = /^GMT([+-]\d{1,2})$/.exec(tz);
  return m ? parseInt(m[1], 10) * 60 : null;
}

function namedOffsetMinutes(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date(ts));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
  return Math.round((asUTC - ts) / 60_000);
}

/** Minutes east of UTC for `ts` in `tz` (cached per local day; DST-aware). */
export function tzOffsetMinutes(ts: number, tz: string): number {
  if (tz === 'UTC') return 0;
  const gmt = parseGmt(tz);
  if (gmt !== null) return gmt;
  const key = `${tz}:${Math.floor(ts / DAY)}`;
  let off = offsetCache.get(key);
  if (off === undefined) {
    try {
      off = namedOffsetMinutes(ts, tz);
    } catch {
      off = 0; // unknown zone -> UTC
    }
    offsetCache.set(key, off);
  }
  return off;
}

/** Minute-of-day [0..1439] for `ts` in `tz`. */
export function minuteOfDay(ts: number, tz: string): number {
  const localMs = ts + tzOffsetMinutes(ts, tz) * 60_000;
  return ((Math.floor((localMs % DAY) / 60_000) % 1440) + 1440) % 1440;
}

/** Local day index for `ts` in `tz` (for grouping sessions by day). */
export function dayKey(ts: number, tz: string): number {
  return Math.floor((ts + tzOffsetMinutes(ts, tz) * 60_000) / DAY);
}

// ---- display formatting ------------------------------------------------------

/** `YYYY-MM-DD HH:MM` for `ts` shown in `tz` (no seconds). */
export function formatDateTime(ts: number, tz: string): string {
  const shifted = new Date(ts + tzOffsetMinutes(ts, tz) * 60_000);
  return shifted.toISOString().replace('T', ' ').slice(0, 16);
}

/** `HH:MM` for `ts` shown in `tz`. */
export function formatTime(ts: number, tz: string): string {
  const shifted = new Date(ts + tzOffsetMinutes(ts, tz) * 60_000);
  return shifted.toISOString().slice(11, 16);
}

/** Short label for a zone (e.g. America/New_York -> "New York"). */
export function zoneLabel(tz: string): string {
  return tz === 'UTC' ? 'UTC' : (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}

/** Common display timezones offered in the picker. */
export const DISPLAY_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney'
] as const;
