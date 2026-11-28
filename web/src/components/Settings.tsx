'use client';

import { useEffect, useState } from 'react';
import { X, FolderOpen, RefreshCw, Palette } from 'lucide-react';
import { useObsidianStore } from '@/store/obsidianStore';
import { useSettingsStore, PRESETS, type ChartTheme } from '@/store/settingsStore';
import { useVault } from '@/lib/obsidian/vaultFs';
import {
  notionStatus,
  notionConnect,
  notionDisconnect,
  notionSaveConfig,
  notionListContent,
  type NotionStatus,
  type NotionContent
} from '@/lib/notion';
import { Modal } from '@/components/ui/dialog';

const field = 'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100';

const CHART_SWATCHES: { key: keyof ChartTheme; label: string }[] = [
  { key: 'up', label: 'Up candle' },
  { key: 'down', label: 'Down candle' },
  { key: 'upBorder', label: 'Up border' },
  { key: 'downBorder', label: 'Down border' },
  { key: 'background', label: 'Background' },
  { key: 'grid', label: 'Grid' },
  { key: 'text', label: 'Axis text' },
  { key: 'axis', label: 'Axis lines' },
];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (UK)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

function swatchVal(theme: ChartTheme, key: keyof ChartTheme): string {
  if (key === 'upBorder') return theme.upBorder ?? theme.up;
  if (key === 'downBorder') return theme.downBorder ?? theme.down;
  return theme[key] as string;
}

/** App settings: global chart styling + journaling target (Obsidian | Notion). */
export function Settings({ onClose }: { onClose: () => void }) {
  const cfg = useObsidianStore();
  const vault = useVault();
  const theme = useSettingsStore((s) => s.theme);
  const preset = useSettingsStore((s) => s.preset);
  const customThemes = useSettingsStore((s) => s.customThemes);
  const timezone = useSettingsStore((s) => s.timezone);
  const applyPreset = useSettingsStore((s) => s.applyPreset);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const saveTheme = useSettingsStore((s) => s.saveTheme);
  const deleteTheme = useSettingsStore((s) => s.deleteTheme);
  const resetTheme = useSettingsStore((s) => s.resetTheme);
  const setTimezone = useSettingsStore((s) => s.setTimezone);
  const [themeName, setThemeName] = useState('');

  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [content, setContent] = useState<NotionContent>({ databases: [], pages: 0 });
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dbs = content.databases;
  const refreshNotion = async () => {
    try {
      const s = await notionStatus();
      setStatus(s);
      if (s.connected) setContent(await notionListContent());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  useEffect(() => {
    // post-effect tick: keeps setState out of the synchronous effect body
    void Promise.resolve().then(refreshNotion);
     
  }, []);

  const connect = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await notionConnect(token.trim());
      setToken('');
      await refreshNotion();
      setMsg({ ok: true, text: 'Notion connected.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    try {
      await notionDisconnect();
      setContent({ databases: [], pages: 0 });
      await refreshNotion();
    } finally {
      setBusy(false);
    }
  };
  const saveDbs = (journalDbId: string, forecastDbId: string) => {
    void notionSaveConfig(journalDbId, forecastDbId).catch(() => {});
    setStatus((s) => (s ? { ...s, journalDbId, forecastDbId } : s));
  };

  return (
    <Modal onClose={onClose} ariaLabel="Settings" className="w-[560px]">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <div className="text-sm font-semibold">Settings</div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* Global Chart Appearance — applies live to Replay, Live Boards & Backtest Visual Hub */}
          <section className="space-y-3 rounded border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-300">
                <Palette className="h-3.5 w-3.5 text-sky-400" />
                Chart Appearance (Global)
              </div>
              <button
                type="button"
                onClick={resetTheme}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Reset default
              </button>
            </div>
            <div className="text-[11px] text-slate-500">
              Applies live across Manual Replay, Co-Pilot Live Boards, and the Backtest Visual Hub (synced to cloud).
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.keys(PRESETS).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => applyPreset(n)}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    preset === n ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {n}
                </button>
              ))}
              {Object.keys(customThemes).map((n) => (
                <span
                  key={n}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                    preset === n ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <button type="button" onClick={() => applyPreset(n)}>
                    {n}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${n}`}
                    onClick={() => deleteTheme(n)}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {CHART_SWATCHES.map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                  <span>{label}</span>
                  <input
                    type="color"
                    value={swatchVal(theme, key)}
                    onChange={(e) => setTheme({ [key]: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded border border-slate-700 bg-transparent"
                  />
                </label>
              ))}
            </div>

            {preset === 'Custom' && (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  placeholder="Save custom theme as…"
                  className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    const n = themeName.trim();
                    if (!n) return;
                    saveTheme(n);
                    setThemeName('');
                  }}
                  className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500"
                >
                  Save
                </button>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
              <span className="text-xs text-slate-400">Chart Display Timezone</span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Journal target — the tabs below show only the selected target's settings. */}
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase text-slate-400">Journaling target</div>
            <div className="text-[11px] text-slate-500">
              Where your Journal + Forecast notes are written. Each target has its own settings below.
            </div>
            <div className="flex w-fit rounded border border-slate-700 text-xs">
              {(['obsidian', 'notion'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => cfg.set({ journalTarget: t })}
                  className={`px-3 py-1 capitalize ${cfg.journalTarget === t ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          {/* Obsidian settings (only for the Obsidian target) */}
          {cfg.journalTarget === 'obsidian' && (
          <section className="space-y-2 rounded border border-slate-800 p-3">
            <div className="text-xs font-semibold text-slate-300">Obsidian vault</div>
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
                Backtest folder
                <input value={cfg.backtestFolder} onChange={(e) => cfg.set({ backtestFolder: e.target.value })} className={`mt-0.5 w-full ${field}`} />
              </label>
              <label className="block text-xs text-slate-400">
                Forecast folder
                <input value={cfg.forecastFolder} onChange={(e) => cfg.set({ forecastFolder: e.target.value })} className={`mt-0.5 w-full ${field}`} />
              </label>
              <label className="block text-xs text-slate-400">
                Templates folder
                <input value={cfg.templatesFolder} onChange={(e) => cfg.set({ templatesFolder: e.target.value })} className={`mt-0.5 w-full ${field}`} />
              </label>
            </div>
          </section>
          )}

          {/* Notion settings (only for the Notion target) */}
          {cfg.journalTarget === 'notion' && (
          <section className="space-y-2 rounded border border-slate-800 p-3">
            <div className="text-xs font-semibold text-slate-300">Notion</div>
            {status?.connected ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-emerald-400">Connected to {status.workspaceName}.</span>
                  <button
                    type="button"
                    onClick={refreshNotion}
                    title="Re-check what the integration can see"
                    className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </div>
                {dbs.length === 0 ? (
                  <div className="space-y-1 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-300">
                    <div className="font-medium">
                      {content.pages > 0
                        ? `The integration can see ${content.pages} page(s) but no databases.`
                        : 'The integration is valid but no content is shared with it yet.'}
                    </div>
                    <div className="text-amber-200/80">
                      A token&apos;s read/write capabilities aren&apos;t enough — Notion only exposes content
                      explicitly shared with the integration:
                    </div>
                    <ol className="list-decimal space-y-0.5 pl-4 text-amber-200/80">
                      <li>In Notion, open the database you want journals in (the actual database, not a linked view).</li>
                      <li>Click the <span className="font-mono">•••</span> menu (top-right) → <span className="font-medium">Connections</span> → add your integration.</li>
                      <li>Come back here and hit <span className="font-medium">Refresh</span>.</li>
                    </ol>
                  </div>
                ) : (
                  <>
                    <label className="block text-xs text-slate-400">
                      Journal database
                      <select value={status.journalDbId ?? ''} onChange={(e) => saveDbs(e.target.value, status.forecastDbId ?? '')} className={`mt-0.5 w-full ${field}`}>
                        <option value="">— select —</option>
                        {dbs.map((d) => (
                          <option key={d.id} value={d.id}>{d.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-400">
                      Forecast database
                      <select value={status.forecastDbId ?? ''} onChange={(e) => saveDbs(status.journalDbId ?? '', e.target.value)} className={`mt-0.5 w-full ${field}`}>
                        <option value="">— select —</option>
                        {dbs.map((d) => (
                          <option key={d.id} value={d.id}>{d.title}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button type="button" onClick={disconnect} disabled={busy} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40">
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <div className="text-[11px] text-slate-500">
                  Create an internal integration at notion.so/my-integrations, share your target database(s) with it, then paste the integration token here.
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="secret_… (Notion integration token)"
                    className={`flex-1 ${field}`}
                  />
                  <button type="button" onClick={connect} disabled={busy || !token.trim()} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40">
                    {busy ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              </>
            )}
          </section>
          )}

          {msg && (
            <div className={`rounded border p-2 text-xs ${msg.ok ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300' : 'border-red-900/60 bg-red-950/30 text-red-300'}`}>
              {msg.text}
            </div>
          )}
        </div>
    </Modal>
  );
}
