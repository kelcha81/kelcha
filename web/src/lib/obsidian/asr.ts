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

// Daily ASR (Trade Type: Live) — for forward-test / live trades. Same body; no
// backtest_* date fields. Mirrors the plugin's BUILT_IN_DAILY_ASR_TEMPLATE.
export const BUILT_IN_DAILY_ASR_TEMPLATE = `---
date:
Pairing:
Document type: Daily ASR
Trade Type: Live
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
missed_reason:
missed_valid:
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

export function formatPairForProperty(pair: string): string {
  const compact = pair.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return compact.length === 6 ? `${compact.slice(0, 3)}/${compact.slice(3)}` : compact;
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
