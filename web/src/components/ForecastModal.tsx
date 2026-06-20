'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, CalendarRange, Settings, Camera, Upload, Trash2 } from 'lucide-react';
import { useObsidianStore } from '@/store/obsidianStore';
import { captureActivePane } from '@/lib/chartShot';
import { parseFrontmatter, parseFrontmatterKeys, parseYamlList, PLUGIN_MANAGED_KEYS } from '@/lib/obsidian/asr';
import { buildForecast, updateForecast, FORECAST_AUTO_KEYS, TEMPLATE_FILE, type ForecastHorizon } from '@/lib/obsidian/forecast';

const ATTACH = 'attachments';
const SLOTS = ['Daily', '4hr', '1hr', '15 minutes'];
const SELECTS: Record<string, string[]> = { daily_bias: ['', 'Bullish', 'Bearish', 'Neutral'] };
const LIST_KEY = 'liquidity_targets';
const DEFAULT_KEYS = ['daily_bias', 'liquidity_targets', 'draw_on_liquidity', 'invalidation'];

const labelize = (k: string) => k.replace(/_/g, ' ');

interface Capture {
  id: string;
  tf: string;
  dataUrl: string;
  name: string;
}

/** Create a Forecast (pre-trade plan) note in the Obsidian vault. */
export function ForecastModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const cfg = useObsidianStore();
  const [showSettings, setShowSettings] = useState(!cfg.vaultPath);

  const [horizon, setHorizon] = useState<ForecastHorizon>('Daily');
  const [template, setTemplate] = useState<string | null | undefined>(undefined);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState(''); // liquidity_targets, one per line/comma
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ name: string; baseMd: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingTf = useRef<string | null>(null);

  // Read the matching Forecast template so the form reflects the user's fields.
  useEffect(() => {
    if (!cfg.vaultPath) {
      setTemplate(null);
      return;
    }
    let cancelled = false;
    setTemplate(undefined);
    const url = `/api/obsidian?vault=${encodeURIComponent(cfg.vaultPath)}&templates=${encodeURIComponent(
      cfg.templatesFolder
    )}&file=${encodeURIComponent(TEMPLATE_FILE[horizon])}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => !cancelled && setTemplate(d.template ?? null))
      .catch(() => !cancelled && setTemplate(null));
    return () => {
      cancelled = true;
    };
  }, [cfg.vaultPath, cfg.templatesFolder, horizon]);

  const editableKeys = useMemo(() => {
    const keys = template ? parseFrontmatterKeys(template) : DEFAULT_KEYS;
    return keys.filter((k) => !FORECAST_AUTO_KEYS.has(k) && !PLUGIN_MANAGED_KEYS.has(k));
  }, [template]);

  const setField = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  // List existing Forecast notes so one can be reopened and updated (md → form).
  useEffect(() => {
    if (!cfg.vaultPath) return;
    let cancelled = false;
    fetch(`/api/obsidian?vault=${encodeURIComponent(cfg.vaultPath)}&folder=${encodeURIComponent(cfg.forecastFolder)}&list=1`)
      .then((r) => r.json())
      .then((d) => !cancelled && setNotes(Array.isArray(d.notes) ? d.notes : []))
      .catch(() => !cancelled && setNotes([]));
    return () => {
      cancelled = true;
    };
  }, [cfg.vaultPath, cfg.forecastFolder]);

  const startNew = () => {
    setEditing(null);
    setFields({});
    setTargets('');
    setCaptures([]);
    setMsg(null);
  };

  const openExisting = async (name: string) => {
    if (!name) return startNew();
    try {
      const d = await fetch(
        `/api/obsidian?vault=${encodeURIComponent(cfg.vaultPath)}&folder=${encodeURIComponent(cfg.forecastFolder)}&note=${encodeURIComponent(name)}`
      ).then((r) => r.json());
      if (!d.content) return setMsg({ ok: false, text: 'Could not read that note.' });
      const fm = parseFrontmatter(d.content);
      setHorizon(fm['forecast_horizon'] === 'Weekly' || /weekly/i.test(fm['Document type'] ?? '') ? 'Weekly' : 'Daily');
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(fm)) {
        if (FORECAST_AUTO_KEYS.has(k) || PLUGIN_MANAGED_KEYS.has(k) || k === LIST_KEY) continue;
        next[k] = v;
      }
      setFields(next);
      setTargets(parseYamlList(fm[LIST_KEY]).join('\n'));
      setCaptures([]);
      setEditing({ name, baseMd: d.content });
      setMsg(null);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const addCapture = (tf: string, dataUrl: string) => {
    const id = Math.random().toString(36).slice(2, 8);
    const name = `${symbol}-forecast-${tf}-${id}.png`.replace(/[^A-Za-z0-9._-]/g, '');
    setCaptures((prev) => [...prev, { id, tf, dataUrl, name }]);
  };
  const captureFromChart = (tf: string) => {
    const url = captureActivePane();
    if (!url) return setMsg({ ok: false, text: 'No chart to capture — open a chart pane first.' });
    addCapture(tf, url);
  };
  const pickUpload = (tf: string) => {
    pendingTf.current = tf;
    fileRef.current?.click();
  };
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tf = pendingTf.current;
    e.target.value = '';
    if (!file || !tf) return;
    const reader = new FileReader();
    reader.onload = () => addCapture(tf, String(reader.result));
    reader.readAsDataURL(file);
  };
  const removeCapture = (id: string) => setCaptures((prev) => prev.filter((c) => c.id !== id));

  const save = async () => {
    if (!cfg.vaultPath) {
      setMsg({ ok: false, text: 'Set your vault path first.' });
      setShowSettings(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const relPath = (name: string) => [cfg.forecastFolder, ATTACH, name].filter(Boolean).join('/');
      const fcCaptures = captures.map((c) => ({ tf: c.tf, path: relPath(c.name) }));
      const images = captures.map((c) => ({ name: c.name, dataUrl: c.dataUrl }));
      const list = targets
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const listFields: Record<string, string[]> = list.length ? { [LIST_KEY]: list } : {};
      let filename: string;
      let markdown: string;
      if (editing) {
        // edit in place: keep the note's body + identity (date/filename)
        filename = editing.name;
        markdown = updateForecast(editing.baseMd, { fields, listFields, captures: fcCaptures });
      } else {
        ({ filename, markdown } = buildForecast({ template, symbol, horizon, fields, listFields, captures: fcCaptures }));
      }

      const res = await fetch('/api/obsidian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultPath: cfg.vaultPath,
          folder: cfg.forecastFolder,
          attachmentsSubfolder: ATTACH,
          filename,
          markdown,
          images
        })
      }).then((r) => r.json());

      if (res.ok) setMsg({ ok: true, text: `Saved ${res.path}` });
      else setMsg({ ok: false, text: res.error || 'Write failed' });
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
        <label key={k} className="col-span-2 block text-xs capitalize text-slate-400">
          {labelize(k)} <span className="normal-case text-slate-600">(one per line)</span>
          <textarea
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            rows={2}
            placeholder={'BSL 1.0892\nSSL 1.0823\nEQH H4'}
            className={`mt-0.5 w-full ${field}`}
          />
        </label>
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
      <label key={k} className="col-span-2 block text-xs capitalize text-slate-400">
        {labelize(k)}
        <input value={fields[k] ?? ''} onChange={(e) => setField(k, e.target.value)} className={`mt-0.5 w-full ${field}`} />
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
            <CalendarRange className="h-4 w-4" /> New Forecast — {symbol.toUpperCase()}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowSettings((s) => !s)} className="text-slate-400 hover:text-white" aria-label="Vault settings">
              <Settings className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="flex rounded border border-slate-700 text-xs">
            {(['Daily', 'Weekly'] as ForecastHorizon[]).map((h) => (
              <button
                key={h}
                type="button"
                disabled={!!editing}
                onClick={() => setHorizon(h)}
                className={`px-3 py-1 disabled:opacity-40 ${horizon === h ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                {h} Forecast
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={editing?.name ?? ''}
              onChange={(e) => openExisting(e.target.value)}
              className={`flex-1 ${field}`}
              title="Reopen an existing Forecast to update it"
            >
              <option value="">New forecast…</option>
              {notes.map((n) => (
                <option key={n} value={n}>
                  {n.replace(/\.md$/, '')}
                </option>
              ))}
            </select>
            {editing && (
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
              Editing <span className="font-mono">{editing.name}</span> — body &amp; date preserved; edited fields and new
              screenshots are merged in.
            </div>
          )}

          {showSettings && (
            <div className="space-y-2 rounded border border-slate-800 p-2">
              <div className="text-[10px] uppercase text-slate-500">Vault</div>
              <label className="block text-xs text-slate-400">
                Vault path (absolute)
                <input
                  value={cfg.vaultPath}
                  onChange={(e) => cfg.set({ vaultPath: e.target.value })}
                  placeholder="C:\\Users\\you\\Obsidian\\Trading"
                  className={`mt-0.5 w-full ${field}`}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-slate-400">
                  Forecast folder
                  <input value={cfg.forecastFolder} onChange={(e) => cfg.set({ forecastFolder: e.target.value })} className={`mt-0.5 w-full ${field}`} />
                </label>
                <label className="block text-xs text-slate-400">
                  Templates folder
                  <input value={cfg.templatesFolder} onChange={(e) => cfg.set({ templatesFolder: e.target.value })} className={`mt-0.5 w-full ${field}`} />
                </label>
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-500">
            {template === undefined
              ? 'Reading template…'
              : template
                ? `Fields synced from your ${horizon} Forecast Template. The plugin auto-links a same-date/same-pair ASR.`
                : `Using the built-in ${horizon} Forecast template (set a vault path to sync your own).`}
          </div>

          <div className="grid grid-cols-2 gap-2">{editableKeys.map(renderField)}</div>

          <div className="rounded border border-slate-800 p-2">
            <div className="mb-1 text-[10px] uppercase text-slate-500">Screenshots</div>
            <div className="space-y-1.5">
              {SLOTS.map((tf) => {
                const shots = captures.filter((c) => c.tf === tf);
                return (
                  <div key={tf} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-slate-400">{tf}</span>
                    <button
                      type="button"
                      onClick={() => captureFromChart(tf)}
                      title="Capture the active chart"
                      className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700"
                    >
                      <Camera className="h-3 w-3" /> Capture
                    </button>
                    <button
                      type="button"
                      onClick={() => pickUpload(tf)}
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
            <div className="mt-1 text-[10px] text-slate-500">Capture the active chart per timeframe; they embed under the matching headings.</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />

          {msg && (
            <div className={`rounded border p-2 text-xs ${msg.ok ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300' : 'border-red-900/60 bg-red-950/30 text-red-300'}`}>
              {msg.text}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? 'Saving…' : editing ? 'Update Forecast' : 'Save Forecast'}
          </button>
        </div>
      </div>
    </div>
  );
}
