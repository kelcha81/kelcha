import type { Timeframe } from '@/store/replayStore';

// Per-timeframe visibility for a drawing (TradingView "Visibility on intervals").
// Each unit group can be toggled on/off and given a numeric range; a chart shows
// the drawing only if its timeframe's unit is on and its value is within [from,to].
// Stored in the overlay's extendData.tfVisibility; absent = visible everywhere.

export type TfUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export interface TfRange {
  on: boolean;
  from: number;
  to: number;
}
export type TfVisibility = Partial<Record<TfUnit, TfRange>>;

// Our discrete timeframes → the unit group + value they live in.
const TF_UNIT: Record<Timeframe, { unit: TfUnit; value: number }> = {
  m1: { unit: 'minutes', value: 1 },
  m5: { unit: 'minutes', value: 5 },
  m15: { unit: 'minutes', value: 15 },
  h1: { unit: 'hours', value: 1 },
  h4: { unit: 'hours', value: 4 },
  d1: { unit: 'days', value: 1 },
  w1: { unit: 'weeks', value: 1 },
  mo1: { unit: 'months', value: 1 }
};

// Unit rows shown in the Visibility tab; `to` is the default upper bound (covers
// every timeframe we ship, so a fresh config is "visible everywhere").
export const TF_UNITS: { unit: TfUnit; label: string; to: number }[] = [
  { unit: 'minutes', label: 'Minutes', to: 60 },
  { unit: 'hours', label: 'Hours', to: 24 },
  { unit: 'days', label: 'Days', to: 30 },
  { unit: 'weeks', label: 'Weeks', to: 52 },
  { unit: 'months', label: 'Months', to: 12 }
];

/** A full default config (all units on, ranges covering everything). */
export function defaultTfVisibility(): TfVisibility {
  const out: TfVisibility = {};
  for (const u of TF_UNITS) out[u.unit] = { on: true, from: 1, to: u.to };
  return out;
}

/** True if the config permits this timeframe (missing config/unit → visible). */
export function isVisibleOnTf(config: TfVisibility | undefined, tf: Timeframe | null): boolean {
  if (!config || !tf) return true;
  const { unit, value } = TF_UNIT[tf];
  const g = config[unit];
  if (!g) return true;
  return g.on && value >= g.from && value <= g.to;
}

/** Resolved visibility of a drawing on a pane: hard "hidden" flag ∧ per-TF rule. */
export function computeVisible(extendData: unknown, tf: Timeframe | null): boolean {
  const e = (extendData ?? {}) as { hidden?: boolean; tfVisibility?: TfVisibility };
  if (e.hidden === true) return false;
  return isVisibleOnTf(e.tfVisibility, tf);
}
