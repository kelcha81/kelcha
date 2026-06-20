// Builds a Forecast (pre-trade plan) note matching the obsidian-ai-agents plugin's
// Daily / Weekly Forecast schema. Forecasts hold the plan + plan-stage screenshots
// before a trade; the plugin auto-links a same-date / same-pair ASR to its Forecast.

import {
  applyReplacements,
  compactPair,
  ddmmyyyy,
  embedByTimeframe,
  formatPairForProperty,
  setFrontmatter
} from './asr';

const DAILY_BODY = `
## Daily / Timeframe

-

![]()

## 4hr / Timeframe

-

![]()

## 1hr / Timeframe

-

![]()

## 15 minutes / Timeframe

-

![]()

## Killzone Plan

- **Asian:**
- **London Open:**
- **NY AM:**
- **NY PM:**
- **London Close:**

## Trade Ideas & Scenarios

**Bullish Scenario:**
-

**Bearish Scenario:**
-

**Invalidation:**
-
`;

const WEEKLY_BODY = `
## Daily / Timeframe

-

![]()

## 4hr / Timeframe

-

![]()

## 1hr / Timeframe

-

![]()

## 15 minutes / Timeframe

-

![]()

## Liquidity Map

- **Daily BSL:**
- **Daily SSL:**
- **EQH:**
- **EQL:**

## Daily Scenarios

**Bullish Scenario:**
-

**Bearish Scenario:**
-

**Invalidation:**
-
`;

export const BUILT_IN_DAILY_FORECAST_TEMPLATE = `---
date:
Pairing:
Document type: Daily Forecast
forecast_horizon: Daily
daily_bias:
liquidity_targets: []
draw_on_liquidity:
invalidation:
---
${DAILY_BODY}`;

export const BUILT_IN_WEEKLY_FORECAST_TEMPLATE = `---
date:
week_commencing:
Pairing:
Document type: Weekly Forecast
forecast_horizon: Weekly
daily_bias:
liquidity_targets: []
draw_on_liquidity:
invalidation:
---
${WEEKLY_BODY}`;

export type ForecastHorizon = 'Daily' | 'Weekly';

/** Property keys the app derives (the user never edits these). */
export const FORECAST_AUTO_KEYS = new Set([
  'date',
  'Pairing',
  'Document type',
  'forecast_horizon',
  'week_commencing'
]);

export const TEMPLATE_FILE = {
  Daily: 'Daily Forecast Template.md',
  Weekly: 'Weekly Forecast Template.md'
} as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the current week (Mon–Sun), used for Weekly Forecast dates. */
function mondayOfCurrentWeek(): Date {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon;
}

export interface ForecastInput {
  template?: string | null;
  symbol: string;
  horizon: ForecastHorizon;
  fields?: Record<string, string>; // daily_bias, draw_on_liquidity, invalidation, custom…
  listFields?: Record<string, string[]>; // liquidity_targets, …
  captures?: { tf: string; path: string }[];
}

export function buildForecast(input: ForecastInput): { filename: string; markdown: string } {
  const fallback = input.horizon === 'Weekly' ? BUILT_IN_WEEKLY_FORECAST_TEMPLATE : BUILT_IN_DAILY_FORECAST_TEMPLATE;
  const tpl = input.template && input.template.includes('---') ? input.template : fallback;
  const dateISO = input.horizon === 'Weekly' ? isoOf(mondayOfCurrentWeek()) : isoOf(new Date());

  const values: Record<string, string> = {
    date: dateISO,
    Pairing: formatPairForProperty(input.symbol),
    'Document type': `${input.horizon} Forecast`,
    forecast_horizon: input.horizon,
    ...(input.horizon === 'Weekly' ? { week_commencing: dateISO } : {}),
    ...(input.fields ?? {})
  };

  let md = applyReplacements(tpl, values);
  for (const [key, vals] of Object.entries(input.listFields ?? {})) {
    if (!vals.length) continue;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const list = vals.map((v) => `"${v}"`).join(', ');
    md = md.replace(new RegExp(`^${escapedKey}:.*$`, 'm'), `${key}: [${list}]`);
  }
  md = embedByTimeframe(md, input.captures ?? []);

  const pair = compactPair(input.symbol);
  const filename =
    input.horizon === 'Weekly'
      ? `Weekly Forecast ${pair}-W-C ${ddmmyyyy(dateISO)}.md`
      : `Daily Forecast ${pair}-${ddmmyyyy(dateISO)}.md`;
  return { filename, markdown: md };
}

/** Update an existing Forecast note in place: overwrite the edited frontmatter
 * fields and embed any new screenshots, preserving the note's body + identity
 * (date/filename). Used by the open-and-edit (md → form → md) round-trip. */
export function updateForecast(
  baseMd: string,
  input: { fields?: Record<string, string>; listFields?: Record<string, string[]>; captures?: { tf: string; path: string }[] }
): string {
  let md = setFrontmatter(baseMd, input.fields ?? {});
  for (const [key, vals] of Object.entries(input.listFields ?? {})) {
    if (!vals.length) continue;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const list = vals.map((v) => `"${v}"`).join(', ');
    md = md.replace(new RegExp(`^${escapedKey}:.*$`, 'm'), `${key}: [${list}]`);
  }
  return embedByTimeframe(md, input.captures ?? []);
}
