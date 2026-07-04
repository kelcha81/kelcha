'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, BookOpen, Camera, Upload, Trash2 } from 'lucide-react';
import { useObsidianStore } from '@/store/obsidianStore';
import { captureActivePane } from '@/lib/chartShot';
import {
  buildBacktestAsr,
  updateBacktestAsr,
  parseFrontmatter,
  parseFrontmatterKeys,
  parseYamlList,
  AUTO_FILLED_KEYS,
  PLUGIN_MANAGED_KEYS
} from '@/lib/obsidian/asr';
import { useVault, writeNote, listNotes, readNote, readTemplate } from '@/lib/obsidian/vaultFs';
import { saveJournalEntry } from '@/lib/journal';
import { notionJournal } from '@/lib/notion';
import { useAuth } from '@/lib/auth';
import { useReplayStore } from '@/store/replayStore';
import { Modal } from '@/components/ui/dialog';

// A trade from any source (ICT backtest or manual papertrade), normalized to the
// fields the ASR builder needs.
export interface JournalTrade {
  side: 'long' | 'short';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  sl?: number | null;
  tp?: number | null;
  pnl: number;
}

const KILLZONES = ['', 'Asian', 'London Open', 'NY AM', 'NY PM', 'London Close'];
const PHASES = ['', 'Accumulation', 'Manipulation', 'Distribution'];
const INDICATORS = ['OB', 'FVG', 'OTE', 'BSL', 'SSL', 'MSS', 'CHoCH', 'Displacement'];

// Recognized journal keys get a purpose-built widget; any other template key
// falls back to a plain text input so new/renamed template fields still capture.
const SELECTS: Record<string, string[]> = {
  killzone: KILLZONES,
  po3_phase: PHASES,
  setup_grade: ['', 'A', 'B', 'C'],
  confidence: ['', '1', '2', '3', '4', '5']
};
const LIST_KEY = 'trade_indicators';
const ATTACH = 'attachments';

// Screenshot slots, aligned to the ASR body's Pre-entry / Post-entry headings.
const SLOTS: { stage: 'pre' | 'post'; tf: string; label: string }[] = [
  { stage: 'pre', tf: 'Daily', label: 'Plan · Daily' },
  { stage: 'pre', tf: 'H1', label: 'Plan · H1' },
  { stage: 'pre', tf: 'M15', label: 'Plan · M15' },
  { stage: 'post', tf: 'H1', label: 'Trade · H1' },
  { stage: 'post', tf: 'M15', label: 'Trade · M15' }
];

interface Capture {
  id: string;
  stage: 'pre' | 'post';
  tf: string;
  dataUrl: string;
  name: string;
  note: string; // annotation written below the screenshot in the note
}
// Editable keys shown when the user has no custom template (mirrors the built-in).
const DEFAULT_KEYS = ['killzone', 'po3_phase', 'setup_grade', 'confidence', LIST_KEY];
// Free-text/optional plugin fields we don't surface from a backtest result row.
const HIDDEN_KEYS = new Set(['missed_reason', 'missed_valid']);

const fmtTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const labelize = (k: string) => k.replace(/_/g, ' ');

/** Journal one trade as a Backtesting ASR note in the Obsidian vault. */
export function JournalModal({
  trade,
  symbol,
  pricePrecision,
  onClose
}: {
  trade?: JournalTrade | null; // omitted when opened standalone to edit an existing ASR
  symbol: string;
  pricePrecision: number;
  onClose: () => void;
}) {
  const cfg = useObsidianStore();
  const vault = useVault();
  const { user } = useAuth();
  const toNotion = cfg.journalTarget === 'notion';

  // The user's resolved template (undefined = loading, null = none → built-in).
  const [template, setTemplate] = useState<string | null | undefined>(undefined);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [indicators, setIndicators] = useState<string[]>([]);
  const [wentWell, setWentWell] = useState('');
  const [improve, setImprove] = useState('');
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ name: string; baseMd: string } | null>(null);
  const folder = cfg.backtestFolder;
  const templateFile = 'Backtesting ASR Template.md';
  // The SESSION date being backtested (drives the filename + session-date
  // frontmatter). Defaults to the trade's entry date, else the replay head —
  // editable so you never have to guess what the note will be called.
  const [sessionDate, setSessionDate] = useState(() => {
    const ms = trade?.entryTime ?? useReplayStore.getState().currentTimestamp;
    return ms ? new Date(ms).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef<{ stage: 'pre' | 'post'; tf: string } | null>(null);

  const addCapture = (stage: 'pre' | 'post', tf: string, dataUrl: string) => {
    const id = Math.random().toString(36).slice(2, 8);
    const name = `${symbol}-${stage}-${tf}-${id}.png`.replace(/[^A-Za-z0-9._-]/g, '');
    setCaptures((prev) => [...prev, { id, stage, tf, dataUrl, name, note: '' }]);
  };

  const setCaptureNote = (id: string, note: string) =>
    setCaptures((prev) => prev.map((c) => (c.id === id ? { ...c, note } : c)));

  const captureFromChart = (stage: 'pre' | 'post', tf: string) => {
    const url = captureActivePane();
    if (!url) {
      setMsg({ ok: false, text: 'No chart to capture — open a chart pane first.' });
      return;
    }
    addCapture(stage, tf, url);
  };

  const pickUpload = (stage: 'pre' | 'post', tf: string) => {
    pendingSlot.current = { stage, tf };
    fileRef.current?.click();
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = pendingSlot.current;
    e.target.value = '';
    if (!file || !slot) return;
    const reader = new FileReader();
    reader.onload = () => addCapture(slot.stage, slot.tf, String(reader.result));
    reader.readAsDataURL(file);
  };

  const removeCapture = (id: string) => setCaptures((prev) => prev.filter((c) => c.id !== id));

  // Read the template so the form reflects whatever fields the user's Obsidian
  // template currently declares (templates can change independently of the app).
  useEffect(() => {
    if (toNotion || !vault.connected) {
      setTemplate(null); // Notion + disconnected vault both use the built-in template
      return;
    }
    let cancelled = false;
    setTemplate(undefined);
    readTemplate(cfg.templatesFolder, templateFile)
      .then((t) => !cancelled && setTemplate(t))
      .catch(() => !cancelled && setTemplate(null));
    return () => {
      cancelled = true;
    };
  }, [toNotion, vault.connected, cfg.templatesFolder, templateFile]);

  // Editable journal keys = template's frontmatter minus auto/plugin/hidden keys.
  const editableKeys = useMemo(() => {
    const keys = template ? parseFrontmatterKeys(template) : DEFAULT_KEYS;
    return keys.filter((k) => !AUTO_FILLED_KEYS.has(k) && !PLUGIN_MANAGED_KEYS.has(k) && !HIDDEN_KEYS.has(k));
  }, [template]);

  const setField = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));
  const toggleIndicator = (i: string) =>
    setIndicators((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  // List existing ASR notes (in the active folder) so one can be reopened (md → form).
  // Obsidian-only: reopening/editing an existing note is a vault operation.
  useEffect(() => {
    if (toNotion || !vault.connected) return;
    let cancelled = false;
    listNotes(folder)
      .then((n) => !cancelled && setNotes(n))
      .catch(() => !cancelled && setNotes([]));
    return () => {
      cancelled = true;
    };
  }, [toNotion, vault.connected, folder]);

  const startNew = () => {
    setEditing(null);
    setFields({});
    setIndicators([]);
    setWentWell('');
    setImprove('');
    setCaptures([]);
    setMsg(null);
  };

  const openExisting = async (name: string) => {
    if (!name) return startNew();
    try {
      const content = await readNote(folder, name);
      if (!content) return setMsg({ ok: false, text: 'Could not read that note.' });
      const fm = parseFrontmatter(content);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(fm)) {
        if (AUTO_FILLED_KEYS.has(k) || PLUGIN_MANAGED_KEYS.has(k) || HIDDEN_KEYS.has(k) || k === LIST_KEY) continue;
        next[k] = v;
      }
      setFields(next);
      setIndicators(parseYamlList(fm[LIST_KEY]));
      setCaptures([]);
      setEditing({ name, baseMd: content });
      setMsg(null);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const canSave = !!editing || !!trade;

  const save = async () => {
    if (!toNotion && !vault.connected) {
      setMsg({ ok: false, text: 'Connect your Obsidian vault in Settings first.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const listFields: Record<string, string[]> = editableKeys.includes(LIST_KEY) ? { [LIST_KEY]: indicators } : {};
      const scalarFields = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== LIST_KEY));

      // Each capture is written under <folder>/attachments and embedded by path,
      // with its annotation directly below the screenshot.
      const relPath = (name: string) => [folder, ATTACH, name].filter(Boolean).join('/');
      const asrCaptures = captures.map((c) => ({ stage: c.stage, tf: c.tf, path: relPath(c.name), note: c.note }));
      const images = captures.map((c) => ({ name: c.name, dataUrl: c.dataUrl }));

      let filename: string;
      let markdown: string;
      if (editing) {
        // edit in place: keep the note's body, trade-derived fields, and identity
        filename = editing.name;
        markdown = updateBacktestAsr(editing.baseMd, { fields: scalarFields, listFields, captures: asrCaptures });
      } else if (trade) {
        ({ filename, markdown } = buildBacktestAsr({
          template,
          symbol,
          pricePrecision,
          side: trade.side,
          entryTime: trade.entryTime,
          entryPrice: trade.entryPrice,
          exitTime: trade.exitTime,
          exitPrice: trade.exitPrice,
          sl: trade.sl ?? null,
          tp: trade.tp ?? null,
          pnl: trade.pnl,
          fields: scalarFields,
          listFields,
          captures: asrCaptures,
          wentWell,
          improve,
          sessionDate
        }));
      } else {
        setMsg({ ok: false, text: 'Open an existing ASR to edit, or journal a trade from the trades table.' });
        setBusy(false);
        return;
      }

      if (toNotion) {
        // Captures upload to Notion via its File Upload API, captioned with
        // the slot label + annotation.
        await notionJournal(
          'journal',
          filename.replace(/\.md$/, ''),
          markdown,
          captures.map((c) => ({
            name: c.name,
            dataUrl: c.dataUrl,
            caption: `${c.stage === 'pre' ? 'Plan' : 'Trade'} · ${c.tf}${c.note.trim() ? ` — ${c.note.trim()}` : ''}`
          }))
        );
      } else {
        await writeNote(folder, filename, markdown, images);
      }
      if (user) await saveJournalEntry(user.uid, { filename, folder, kind: 'Backtest', markdown, captures: asrCaptures });
      setMsg({ ok: true, text: toNotion ? `Saved ${filename.replace(/\.md$/, '')} to Notion.` : `Saved ${filename} to your vault.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const field = 'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100';

  const renderField = (k: string) => {
    if (k === LIST_KEY) {
      return (
        <div key={k} className="col-span-2">
          <div className="mb-1 text-[10px] uppercase text-slate-500">{labelize(k)}</div>
          <div className="flex flex-wrap gap-2">
            {INDICATORS.map((i) => (
              <label key={i} className="flex items-center gap-1 text-xs text-slate-400">
                <input type="checkbox" checked={indicators.includes(i)} onChange={() => toggleIndicator(i)} />
                {i}
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (SELECTS[k]) {
      return (
        <label key={k} className="block text-xs capitalize text-slate-400">
          {labelize(k)}
          <select value={fields[k] ?? ''} onChange={(e) => setField(k, e.target.value)} className={`mt-0.5 w-full ${field}`}>
            {SELECTS[k].map((o) => (
              <option key={o} value={o}>
                {o || '—'}
              </option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label key={k} className="block text-xs capitalize text-slate-400">
        {labelize(k)}
        <input
          value={fields[k] ?? ''}
          onChange={(e) => setField(k, e.target.value)}
          className={`mt-0.5 w-full ${field}`}
        />
      </label>
    );
  };

  return (
    <Modal onClose={onClose} ariaLabel="Journal" className="w-[560px]">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4" /> Journal to {toNotion ? 'Notion' : 'Obsidian'}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {trade && !editing && (
            <div className="rounded border border-slate-800 p-2 text-[11px] text-slate-400">
              <span className={trade.side === 'short' ? 'text-red-400' : 'text-green-400'}>{trade.side}</span>{' '}
              {symbol.toUpperCase()} · {fmtTime(trade.entryTime)} → {fmtTime(trade.exitTime)} · P&amp;L{' '}
              <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                {(trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(2)}
              </span>
              . Writes a <span className="text-slate-300">Backtest ASR</span> the plugin parses as a closed backtest trade.
            </div>
          )}

          {!editing && (
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Backtest date
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className={`${field} [color-scheme:dark]`}
              />
              <span className="text-[10px] text-slate-500">names the note ({symbol.toUpperCase()} Backtest ASR)</span>
            </label>
          )}

          {!toNotion && (
            <>
              <div className="flex items-center gap-2">
                <select
                  value={editing?.name ?? ''}
                  onChange={(e) => openExisting(e.target.value)}
                  className={`flex-1 ${field}`}
                  title="Reopen an existing ASR to update it"
                >
                  <option value="">{trade ? 'Journal this trade (new ASR)…' : 'Open an existing ASR…'}</option>
                  {notes.map((n) => (
                    <option key={n} value={n}>
                      {n.replace(/\.md$/, '')}
                    </option>
                  ))}
                </select>
                {editing && trade && (
                  <button
                    type="button"
                    onClick={startNew}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    New
                  </button>
                )}
              </div>
              {editing && (
                <div className="rounded border border-amber-900/60 bg-amber-950/20 p-1.5 text-[11px] text-amber-300">
                  Editing <span className="font-mono">{editing.name}</span> — body, trade fields &amp; date preserved; edited
                  fields and new screenshots are merged in.
                </div>
              )}
            </>
          )}

          <div className="text-[10px] text-slate-500">
            {toNotion
              ? 'Writing to Notion using the built-in Backtest ASR fields.'
              : template === undefined
                ? 'Reading template…'
                : template
                  ? `Fields synced from your ${templateFile.replace(/\.md$/, '')}.`
                  : 'Using the built-in Backtest ASR template (connect your vault in Settings to sync your own).'}
          </div>

          <div className="grid grid-cols-2 gap-2">{editableKeys.map(renderField)}</div>

          <div className="rounded border border-slate-800 p-2">
            <div className="mb-1 text-[10px] uppercase text-slate-500">Screenshots</div>
            <div className="space-y-1.5">
              {SLOTS.map((slot) => {
                const shots = captures.filter((c) => c.stage === slot.stage && c.tf === slot.tf);
                return (
                  <div key={slot.label} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-slate-400">{slot.label}</span>
                      <button
                        type="button"
                        onClick={() => captureFromChart(slot.stage, slot.tf)}
                        title="Capture the active chart"
                        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700"
                      >
                        <Camera className="h-3 w-3" /> Capture
                      </button>
                      <button
                        type="button"
                        onClick={() => pickUpload(slot.stage, slot.tf)}
                        title="Upload an image"
                        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700"
                      >
                        <Upload className="h-3 w-3" />
                      </button>
                    </div>
                    {shots.map((s) => (
                      <div key={s.id} className="ml-20 flex items-center gap-2 pl-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.dataUrl} alt={s.name} className="h-8 w-12 shrink-0 rounded border border-slate-700 object-cover" />
                        <input
                          type="text"
                          value={s.note}
                          placeholder="Note for this screenshot…"
                          onChange={(e) => setCaptureNote(s.id, e.target.value)}
                          className={`flex-1 ${field} py-0.5 text-xs`}
                        />
                        <button
                          type="button"
                          onClick={() => removeCapture(s.id)}
                          className="shrink-0 rounded p-0.5 text-slate-500 hover:text-red-400"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Capture grabs the active chart (with overlays/drawings). Switch the chart timeframe first, then capture into
              the matching slot. They embed under the note&apos;s timeframe headings.
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />

          <label className="block text-xs text-slate-400">
            What went well
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              rows={2}
              className={`mt-0.5 w-full ${field}`}
            />
          </label>
          <label className="block text-xs text-slate-400">
            What can I improve on
            <textarea
              value={improve}
              onChange={(e) => setImprove(e.target.value)}
              rows={2}
              className={`mt-0.5 w-full ${field}`}
            />
          </label>

          {msg && (
            <div
              className={`rounded border p-2 text-xs ${
                msg.ok
                  ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300'
                  : 'border-red-900/60 bg-red-950/30 text-red-300'
              }`}
            >
              {msg.text}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-3">
          <button
            type="button"
            onClick={save}
            disabled={busy || !canSave}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? 'Saving…' : editing ? 'Update ASR' : toNotion ? 'Save to Notion' : 'Save to Obsidian'}
          </button>
        </div>
    </Modal>
  );
}
