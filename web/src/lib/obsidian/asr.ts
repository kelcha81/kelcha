// Builds a Backtesting ASR (After-Session Review) note that matches the current
// obsidian-ai-agents plugin schema (BUILT_IN_BACKTEST_ASR_TEMPLATE + the parser's
// frontmatter), so notes the backtest app writes are parsed by the plugin as
// closed Backtest trades and flow into the Weekly Review / Edge Analysis.

const ASR_BODY = `
# Pre-entry

## Daily / Timeframe

-

![]()

## H1 / Timeframe

-

![]()

## M15 / Timeframe

-

![]()

# Post-entry

---

## H1 / Timeframe

-

![]()

## M15 / Timeframe

-

![]()

# Reflections

---

### What went well

1.

### What can I improve on

1.
`;

// Frontmatter mirrors the plugin's BUILT_IN_BACKTEST_ASR_TEMPLATE (Document type
// and Trade Type are pre-set; the rest are filled by buildBacktestAsr).
export const BUILT_IN_BACKTEST_ASR_TEMPLATE = `---
date:
Pairing:
Document type: Backtest ASR
Trade Type: Backtest
direction:
killzone:
entry:
sl:
po3_phase:
setup_grade:
confidence:
pnl_pips:
outcome:
trade_indicators: []
forecast_link:
backtest_session_date:
missed_reason:
missed_valid:
backtest_performed_date:
---
${ASR_BODY}`;

// Daily ASR (Trade Type: Live) — Gen-3 Obsidian template matching Daily ASR Template.md.
export const BUILT_IN_DAILY_ASR_TEMPLATE = `---
date:
Pairing:
Document type:
  - Daily ASR
Trade Type: Live
direction:
Account %:
pnl_r:
killzone:
entry:
sl:
tp:
po3_phase:
setup_grade:
confidence:
outcome:
missed_reason:
missed_valid:
backtest_performed_date:
trade_indicators: []
forecast_link:
copilot_signal_id:
---
${ASR_BODY}`;

// Fill `key: value` frontmatter lines only when they are empty/placeholder, so a
// user template that already sets Document type / Trade Type is never clobbered.
export function applyReplacements(template: string, values: Record<string, string>): string {
  const fmMatch = template.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) return template;
  let fm = fmMatch[2];
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lineRe = new RegExp(`^(${escapedKey}):[ \\t]*(.*)$`, 'gm');
    fm = fm.replace(lineRe, (match, k: string, v: string) => {
      const trimmed = v.trim();
      const isEmpty =
        trimmed === '' || trimmed === '""' || trimmed === "''" || trimmed === 'null' || trimmed === '~';
      return isEmpty ? `${k}: ${value}` : match;
    });
  }
  return template.replace(fmMatch[0], `${fmMatch[1]}${fm}${fmMatch[3]}`);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const NON_SLASH_PAIRS = new Set([
  'US30',
  'US500',
  'NAS100',
  'GER40',
  'UK100',
  'XAUUSD',
  'XAGUSD',
  'SPX500',
  'NDX100',
]);

export function formatPairForProperty(pair: string): string {
  const compact = pair.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (compact.length === 6 && !NON_SLASH_PAIRS.has(compact) && /^[A-Z]{6}$/.test(compact)) {
    return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  }
  return compact;
}

export interface CopilotAsrExportInput {
  date: string;
  symbol: string;
  direction?: string;
  tf?: string;
  killzone?: string;
  entry?: number | string | null;
  sl?: number | string | null;
  tp?: number | string | null;
  pnlR?: number | null;
  setupGrade?: string;
  verdict?: string;
  outcome?: string;
  signalId?: string;
  thesis?: string;
  actionPlan?: string;
  indicators?: string[];
}

/** Build a canonical Gen-3 Daily ASR `.md` file + filename (`YYYY-MM-DD SYMBOL ASR.md`)
 *  ready for direct drop-in import into Kelvin's Obsidian `Trades/ASR/` vault folder. */
export function buildCopilotAsrMarkdown(input: CopilotAsrExportInput): { filename: string; markdown: string } {
  const dateISO = (input.date || isoToday()).slice(0, 10);
  const sym = compactPair(input.symbol || 'UNKNOWN') || 'UNKNOWN';
  const pairFmt = formatPairForProperty(sym);
  const rawDir = (input.direction || '').toUpperCase();
  const dirLabel =
    rawDir === 'BULL' || rawDir === 'BULLISH' || rawDir === 'LONG' || rawDir === 'BUY'
      ? 'Bullish'
      : rawDir === 'BEAR' || rawDir === 'BEARISH' || rawDir === 'SHORT' || rawDir === 'SELL'
        ? 'Bearish'
        : '';

  const rawOut = (input.outcome || '').toUpperCase();
  const outLabel =
    rawOut === 'WIN'
      ? 'Win'
      : rawOut === 'LOSS'
        ? 'Loss'
        : rawOut === 'BE' || rawOut === 'BREAK EVEN'
          ? 'Break Even'
          : rawOut === 'SKIP' || rawOut === 'MISSED' || rawOut === 'MISSED TRADE'
            ? 'Missed Trade'
            : '';

  const pnlRStr = input.pnlR !== undefined && input.pnlR !== null && !Number.isNaN(input.pnlR)
    ? input.pnlR.toFixed(2)
    : '';
  const entryQ = input.entry !== undefined && input.entry !== null && input.entry !== '' ? `"${input.entry}"` : '';
  const slQ = input.sl !== undefined && input.sl !== null && input.sl !== '' ? `"${input.sl}"` : '';
  const tpQ = input.tp !== undefined && input.tp !== null && input.tp !== '' ? `"${input.tp}"` : '';
  const fcLink = /^\d{4}-\d{2}-\d{2}$/.test(dateISO) ? `Daily Forecast ${sym}-${ddmmyyyy(dateISO)}` : '';
  const indList = (input.indicators || []).filter(Boolean);
  const indYaml = indList.length
    ? `trade_indicators:\n${indList.map((x) => `  - ${x}`).join('\n')}`
    : 'trade_indicators: []';

  const markdown = `---
date: ${dateISO}
Pairing:
  - ${pairFmt}
Document type:
  - Daily ASR
Trade Type: Live
direction: ${dirLabel}
Account %:
pnl_r: ${pnlRStr}
killzone: ${input.killzone || ''}
entry: ${entryQ}
sl: ${slQ}
tp: ${tpQ}
po3_phase:
setup_grade: ${input.setupGrade || ''}
confidence:
outcome: ${outLabel}
missed_reason:
missed_valid:
backtest_performed_date:
${indYaml}
forecast_link: "${fcLink}"
copilot_signal_id: "${input.signalId || ''}"
---

<!-- Naming convention: YYYY-MM-DD [PAIR] ASR.md  (e.g. ${dateISO} ${sym} ASR.md) -->

# Entry

## Daily / Timeframe

> **Co-Pilot Pre-Trade Thesis (${input.verdict || 'RADAR'} · Grade ${input.setupGrade || '—'} · ${(input.tf || 'M15').toUpperCase()}):**
> ${input.thesis || ''}

- **Action Plan:** ${input.actionPlan || ''}

# Post-entry

---

## M15 / Timeframe

-


# Reflections

---

### What went well

1.

### What can I improve on

1.
`;

  return { filename: `${dateISO} ${sym} ASR.md`, markdown };
}

export function downloadMarkdownFile(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function compactPair(pair: string): string {
  return pair.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function isoToday(): string {
  return isoOf(Date.now());
}

function escapeInline(s: string): string {
  return s.replace(/\r?\n/g, ' ').trim();
}

/** The embed written for a capture: the image plus its annotation below it. */
function embedText(c: { path: string; note?: string }): string {
  return c.note?.trim() ? `![[${c.path}]]\n\n${c.note.replace(/\r?\n/g, ' ').trim()}` : `![[${c.path}]]`;
}

/** Reverse of embedText: pull `![[path]]` embeds (+ the annotation line under
 *  each) back out of a note's markdown, so a reopened note can show its saved
 *  screenshots. */
export function parseEmbeds(md: string): { path: string; note?: string }[] {
  const lines = md.split(/\r?\n/);
  const embed = /!\[\[([^\]]+)\]\]/;
  const out: { path: string; note?: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = embed.exec(lines[i]);
    if (!m) continue;
    const noteLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || l.startsWith('#') || embed.test(l)) break;
      noteLines.push(l.trim());
    }
    out.push({ path: m[1].trim(), note: noteLines.join(' ') || undefined });
  }
  return out;
}

// Fill `![]()` placeholders under any `## <tf>` heading, matched by timeframe
// only (no Pre/Post sections) — used by Forecast notes. Leftovers go to "## Charts".
export function embedByTimeframe(md: string, captures: { tf: string; path: string; note?: string }[]): string {
  if (!captures.length) return md;
  const lines = md.split(/\r?\n/);
  const remaining = captures.slice();
  let tf = '';
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^#{2,6}\s+(.*)$/);
    if (h) {
      tf = h[1].split('/')[0].trim().toLowerCase();
      continue;
    }
    if (lines[i].trim() === '![]()') {
      const idx = remaining.findIndex((c) => tf.includes(c.tf.toLowerCase()));
      if (idx >= 0) lines[i] = embedText(remaining.splice(idx, 1)[0]);
    }
  }
  let out = lines.join('\n');
  if (remaining.length) {
    out += `\n\n## Charts\n\n${remaining.map(embedText).join('\n\n')}\n`;
  }
  return out;
}

/** Frontmatter property keys the app derives from the trade itself (the user
 * never edits these). Everything else in a template is an editable journal field. */
export const AUTO_FILLED_KEYS = new Set([
  'date',
  'Pairing',
  'Document type',
  'Trade Type',
  'direction',
  'entry',
  'sl',
  'pnl_pips',
  'outcome',
  'backtest_session_date',
  'backtest_performed_date'
]);

/** Keys the obsidian-ai-agents plugin writes itself (autolink / rule-check /
 * loss-diagnosis) — the app must not set these. */
export const PLUGIN_MANAGED_KEYS = new Set([
  'forecast_link',
  'rules_followed',
  'rules_violated',
  'rule_violation_notes',
  'rule_check_at',
  'loss_diagnosis_tag',
  'loss_diagnosis_note'
]);

/** Parse the ordered frontmatter property keys from a note/template's `---` block.
 * Lets the journal form adapt when the user's Obsidian template changes. */
export function parseFrontmatterKeys(md: string): string[] {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return [];
  const keys: string[] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z0-9_][A-Za-z0-9_ ]*?):/);
    if (km) keys.push(km[1].trim());
  }
  return keys;
}

/** Parse frontmatter into { key: rawValue } (values kept as written, list values
 * as their raw `[...]` text). The inverse of the builders, for editing notes. */
export function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z0-9_][A-Za-z0-9_ ]*?):\s*(.*)$/);
    if (km) out[km[1].trim()] = km[2].trim();
  }
  return out;
}

/** Parse a YAML inline list (`["a", "b"]` or `[a, b]`) into trimmed strings. */
export function parseYamlList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** Overwrite frontmatter `key:` lines with the given values (non-empty only),
 * leaving the body untouched — used to update an existing note in place. */
export function setFrontmatter(md: string, values: Record<string, string>): string {
  const fmMatch = md.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) return md;
  let fm = fmMatch[2];
  for (const [key, value] of Object.entries(values)) {
    if (value === '' || value == null) continue;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    fm = fm.replace(new RegExp(`^(${escapedKey}):[ \\t]*.*$`, 'm'), `$1: ${value}`);
  }
  return md.replace(fmMatch[0], `${fmMatch[1]}${fm}${fmMatch[3]}`);
}

export interface BacktestAsrInput {
  template?: string | null; // resolved user template; falls back to the built-in
  symbol: string;
  pricePrecision: number;
  side: 'long' | 'short';
  entryTime: number; // ms — the historical session being replayed
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  sl?: number | null;
  tp?: number | null;
  pnl: number; // account currency → outcome
  // template-driven journal fields, keyed by frontmatter property name
  fields?: Record<string, string>; // scalar props (killzone, po3_phase, setup_grade, confidence, custom…)
  listFields?: Record<string, string[]>; // array props (trade_indicators, …)
  captures?: AsrCapture[]; // chart screenshots, embedded under matching timeframe headings
  wentWell?: string;
  improve?: string;
  tradeType?: 'Backtest' | 'Live'; // 'Live' → a Daily ASR for forward/live trades
  /** ISO date of the session being BACKTESTED (the chart date, not today) —
   *  drives the filename + backtest_session_date. Default: entryTime's date. */
  sessionDate?: string;
}

/** A chart screenshot bound to a section + timeframe, written to the vault and
 * embedded under the matching `# Pre-entry`/`# Post-entry` → `## <tf>` heading. */
export interface AsrCapture {
  stage: 'pre' | 'post';
  tf: string; // Daily / H1 / M15 … matched against subheadings
  path: string; // vault-relative path to the written image
  note?: string; // annotation written directly below the screenshot
}

// Fill the template's `![]()` image placeholders with `![[path]]` embeds under
// the section + timeframe that matches each capture; leftovers go under "## Charts".
function embedCaptures(md: string, captures: AsrCapture[]): string {
  if (!captures.length) return md;
  const lines = md.split(/\r?\n/);
  const remaining = captures.slice();
  let section: 'pre' | 'post' | 'other' = 'other';
  let tf = '';
  for (let i = 0; i < lines.length; i++) {
    const h1 = lines[i].match(/^#\s+(.*)$/);
    if (h1) {
      const t = h1[1].toLowerCase();
      section = t.includes('pre-entry') ? 'pre' : t.includes('post-entry') ? 'post' : 'other';
      tf = '';
      continue;
    }
    const h2 = lines[i].match(/^#{2,6}\s+(.*)$/);
    if (h2) {
      tf = h2[1].split('/')[0].trim().toLowerCase();
      continue;
    }
    if (lines[i].trim() === '![]()') {
      const idx = remaining.findIndex((c) => c.stage === section && tf.includes(c.tf.toLowerCase()));
      if (idx >= 0) lines[i] = embedText(remaining.splice(idx, 1)[0]);
    }
  }
  let out = lines.join('\n');
  if (remaining.length) {
    out += `\n\n## Charts\n\n${remaining.map(embedText).join('\n\n')}\n`;
  }
  return out;
}

/** Build the note markdown + the plugin's filename convention. Defaults to a
 * Backtest ASR; `tradeType: 'Live'` produces a Daily ASR (forward/live trade). */
export function buildBacktestAsr(input: BacktestAsrInput): { filename: string; markdown: string } {
  const isLive = input.tradeType === 'Live';
  const tpl = input.template && input.template.includes('---')
    ? input.template
    : isLive
      ? BUILT_IN_DAILY_ASR_TEMPLATE
      : BUILT_IN_BACKTEST_ASR_TEMPLATE;
  const prec = input.pricePrecision;
  const dir = input.side === 'long' ? 1 : -1;
  const pip = Math.pow(10, -(prec - 1));
  const pnlPips = ((input.exitPrice - input.entryPrice) * dir) / pip;
  const outcome = input.pnl > 0 ? 'Win' : input.pnl < 0 ? 'Loss' : 'Breakeven';
  const performedISO = isoOf(Date.now());
  const sessionISO = input.sessionDate || isoOf(input.entryTime);
  // Live: journal date = the trade's date. Backtest: date = when it was performed.
  const dateISO = isLive ? sessionISO : performedISO;

  const values: Record<string, string> = {
    date: dateISO,
    Pairing: formatPairForProperty(input.symbol),
    'Document type': isLive ? 'Daily ASR' : 'Backtest ASR',
    'Trade Type': isLive ? 'Live' : 'Backtest',
    direction: input.side === 'long' ? 'Long' : 'Short',
    entry: input.entryPrice.toFixed(prec),
    sl: input.sl != null ? input.sl.toFixed(prec) : '',
    pnl_pips: pnlPips.toFixed(1),
    outcome,
    // backtest-only provenance dates
    ...(isLive ? {} : { backtest_session_date: sessionISO, backtest_performed_date: performedISO }),
    // template-driven journal fields (killzone, po3_phase, setup_grade, custom…)
    ...(input.fields ?? {})
  };

  let md = applyReplacements(tpl, values);
  for (const [key, vals] of Object.entries(input.listFields ?? {})) {
    if (!vals.length) continue;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const list = vals.map((v) => `"${v}"`).join(', ');
    md = md.replace(new RegExp(`^${escapedKey}:.*$`, 'm'), `${key}: [${list}]`);
  }
  md = embedCaptures(md, input.captures ?? []);
  if (input.wentWell) md = md.replace(/(### What went well\s*\r?\n\s*\r?\n)1\./, `$11. ${escapeInline(input.wentWell)}`);
  if (input.improve)
    md = md.replace(/(### What can I improve on\s*\r?\n\s*\r?\n)1\./, `$11. ${escapeInline(input.improve)}`);

  const compact = input.symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // Backtest filenames are named for the SESSION being replayed (the chart
  // date), not the day the review was written — that's what you search by.
  const filename = isLive
    ? `${ddmmyyyy(dateISO)} ${compact} ASR.md`
    : `${ddmmyyyy(sessionISO)} ${compact} Backtest ASR.md`;
  return { filename, markdown: md };
}

/** Update an existing ASR in place: overwrite edited frontmatter + embed new
 * screenshots, preserving the note's body, trade-derived fields, and identity.
 * Mirrors updateForecast for the md → form → md round-trip. */
export function updateBacktestAsr(
  baseMd: string,
  input: { fields?: Record<string, string>; listFields?: Record<string, string[]>; captures?: AsrCapture[] }
): string {
  let md = setFrontmatter(baseMd, input.fields ?? {});
  for (const [key, vals] of Object.entries(input.listFields ?? {})) {
    if (!vals.length) continue;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const list = vals.map((v) => `"${v}"`).join(', ');
    md = md.replace(new RegExp(`^${escapedKey}:.*$`, 'm'), `${key}: [${list}]`);
  }
  return embedCaptures(md, input.captures ?? []);
}
