'use client';

import { useEffect, useState } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { useObsidianStore } from '@/store/obsidianStore';
import { useVault } from '@/lib/obsidian/vaultFs';
import {
  notionStatus,
  notionConnect,
  notionDisconnect,
  notionSaveConfig,
  notionListDatabases,
  type NotionStatus
} from '@/lib/notion';
import { Modal } from '@/components/ui/dialog';

const field = 'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100';

/** App settings: journaling target (Obsidian | Notion) + each one's config. */
export function Settings({ onClose }: { onClose: () => void }) {
  const cfg = useObsidianStore();
  const vault = useVault();

  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [dbs, setDbs] = useState<{ id: string; title: string }[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshNotion = async () => {
    try {
      const s = await notionStatus();
      setStatus(s);
      if (s.connected) setDbs(await notionListDatabases());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  useEffect(() => {
    void refreshNotion();
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
      setDbs([]);
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
                Live ASR folder
                <input value={cfg.liveFolder} onChange={(e) => cfg.set({ liveFolder: e.target.value })} className={`mt-0.5 w-full ${field}`} />
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
                <div className="text-[11px] text-emerald-400">Connected to {status.workspaceName}.</div>
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
