'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, BookOpen, Settings, Camera, Upload, Trash2, FolderOpen } from 'lucide-react';
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
import { useAuth } from '@/lib/auth';

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
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    if (vault.ready && !vault.connected) setShowSettings(true);
  }, [vault.ready, vault.connected]);

  // The user's resolved template (undefined = loading, null = none → built-in).
  const [template, setTemplate] = useState<string | null | undefined>(undefined);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [indicators, setIndicators] = useState<string[]>([]);
  const [wentWell, setWentWell] = useState('');
  const [improve, setImprove] = useState('');
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ name: string; baseMd: string } | null>(null);
  // Backtest ASR (historical) vs Live/Daily ASR (forward test). Drives the folder,
  // template, Document type / Trade Type, and filename.
  const [tradeType, setTradeType] = useState<'Backtest' | 'Live'>('Backtest');
  const folder = tradeType === 'Live' ? cfg.liveFolder : cfg.backtestFolder;
  const templateFile = tradeType === 'Live' ? 'Daily ASR Template.md' : 'Backtesting ASR Template.md';

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef<{ stage: 'pre' | 'post'; tf: string } | null>(null);

  const addCapture = (stage: 'pre' | 'post', tf: string, dataUrl: string) => {
    const id = Math.random().toString(36).slice(2, 8);
    const name = `${symbol}-${stage}-${tf}-${id}.png`.replace(/[^A-Za-z0-9._-]/g, '');
    setCaptures((prev) => [...prev, { id, stage, tf, dataUrl, name }]);
  };

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
    if (!vault.connected) {
      setTemplate(null);
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
  }, [vault.connected, cfg.templatesFolder, templateFile]);

  // Editable journal keys = template's frontmatter minus auto/plugin/hidden keys.
  const editableKeys = useMemo(() => {
    const keys = template ? parseFrontmatterKeys(template) : DEFAULT_KEYS;
    return keys.filter((k) => !AUTO_FILLED_KEYS.has(k) && !PLUGIN_MANAGED_KEYS.has(k) && !HIDDEN_KEYS.has(k));
  }, [template]);

  const setField = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));
  const toggleIndicator = (i: string) =>
    setIndicators((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  // List existing ASR notes (in the active folder) so one can be reopened (md → form).
  useEffect(() => {
    if (!vault.connected) return;
    let cancelled = false;
    listNotes(folder)
      .then((n) => !cancelled && setNotes(n))
      .catch(() => !cancelled && setNotes([]));
    return () => {
      cancelled = true;
    };
  }, [vault.connected, folder]);

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
    if (!vault.connected) {
      setMsg({ ok: false, text: 'Connect your Obsidian vault first.' });
      setShowSettings(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const listFields: Record<string, string[]> = editableKeys.includes(LIST_KEY) ? { [LIST_KEY]: indicators } : {};
      const scalarFields = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== LIST_KEY));

      // Each capture is written under <folder>/attachments and embedded by path.
      const relPath = (name: string) => [folder, ATTACH, name].filter(Boolean).join('/');
      const asrCaptures = captures.map((c) => ({ stage: c.stage, tf: c.tf, path: relPath(c.name) }));
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
          tradeType
        }));
      } else {
        setMsg({ ok: false, text: 'Open an existing ASR to edit, or journal a trade from the trades table.' });
        setBusy(false);
        return;
      }

      await writeNote(folder, filename, markdown, images);
      if (user) await saveJournalEntry(user.uid, { filename, folder, kind: tradeType, markdown, captures: asrCaptures });
      setMsg({ ok: true, text: `Saved ${filename} to your vault.` });
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-[560px] max-w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4" /> Journal to Obsidian
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className="text-slate-400 hover:text-white"
              aria-label="Vault settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="flex rounded border border-slate-700 text-xs">
            {(['Backtest', 'Live'] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={!!editing}
                onClick={() => {
                  setTradeType(t);
                  setEditing(null);
                }}
                className={`px-3 py-1 disabled:opacity-40 ${tradeType === t ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                {t === 'Live' ? 'Live (forward test)' : 'Backtest'}
              </button>
            ))}
          </div>

          {trade && !editing && (
            <div className="rounded border border-slate-800 p-2 text-[11px] text-slate-400">
              <span className={trade.side === 'short' ? 'text-red-400' : 'text-green-400'}>{trade.side}</span>{' '}
              {symbol.toUpperCase()} · {fmtTime(trade.entryTime)} → {fmtTime(trade.exitTime)} · P&amp;L{' '}
              <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                {(trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(2)}
              </span>
              . Writes a <span className="text-slate-300">{tradeType === 'Live' ? 'Daily ASR (Live)' : 'Backtest ASR'}</span>{' '}
              the plugin parses as a closed {tradeType === 'Live' ? 'live' : 'backtest'} trade.
            </div>
          )}

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

          {showSettings && (
            <div className="space-y-2 rounded border border-slate-800 p-2">
              <div className="text-[10px] uppercase text-slate-500">Vault</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={vault.connect}
                  disabled={!vault.supported}
                  className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                >
                  <FolderOpen className="h-3 w-3" /> {vault.connected ? 'Change vault folder' : 'Connect vault folder'}
                </button>
                <span className="text-[11px] text-slate-400">
                  {vault.connected ? vault.name : vault.supported ? 'Not connected' : 'Needs a Chromium browser'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-slate-400">
                  {tradeType === 'Live' ? 'Live ASR folder' : 'Backtest folder'}
                  <input
                    value={folder}
                    onChange={(e) => cfg.set(tradeType === 'Live' ? { liveFolder: e.target.value } : { backtestFolder: e.target.value })}
                    className={`mt-0.5 w-full ${field}`}
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Templates folder
                  <input
                    value={cfg.templatesFolder}
                    onChange={(e) => cfg.set({ templatesFolder: e.target.value })}
                    className={`mt-0.5 w-full ${field}`}
                  />
                </label>
              </div>
              <div className="text-[10px] text-slate-500">
                Point this at the same vault + Backtest folder as the obsidian-ai-agents plugin so it parses the note.
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-500">
            {template === undefined
              ? 'Reading template…'
              : template
                ? `Fields synced from your ${templateFile.replace(/\.md$/, '')}.`
                : `Using the built-in ${tradeType === 'Live' ? 'Daily' : 'Backtest'} ASR template (connect your vault to sync your own).`}
          </div>

          <div className="grid grid-cols-2 gap-2">{editableKeys.map(renderField)}</div>

          <div className="rounded border border-slate-800 p-2">
            <div className="mb-1 text-[10px] uppercase text-slate-500">Screenshots</div>
            <div className="space-y-1.5">
              {SLOTS.map((slot) => {
                const shots = captures.filter((c) => c.stage === slot.stage && c.tf === slot.tf);
                return (
                  <div key={slot.label} className="flex items-center gap-2">
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
                    <div className="flex flex-wrap gap-1">
                      {shots.map((s) => (
                        <span key={s.id} className="group relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.dataUrl} alt={s.name} className="h-8 w-12 rounded border border-slate-700 object-cover" />
                          <button
                            type="button"
                            onClick={() => removeCapture(s.id)}
                            className="absolute -right-1 -top-1 hidden rounded-full bg-slate-900 text-red-400 group-hover:block"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
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
            {busy ? 'Saving…' : editing ? 'Update ASR' : 'Save to Obsidian'}
          </button>
        </div>
      </div>
    </div>
  );
}
