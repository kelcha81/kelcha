'use client';

import { useEffect, useState } from 'react';
import { X, Download, RefreshCw, Database, Loader2 } from 'lucide-react';
import { SYMBOL_LIST, type SymbolInfo } from '@/lib/symbols';
import { preloadSymbol, clearMemCache } from '@/lib/candleSource';
import { hasSymbol, deleteSymbol } from '@/lib/idb';
import { getIdToken } from '@/lib/firebase';
import { Modal } from '@/components/ui/dialog';

interface Status {
  packaged: boolean;
  seeded: boolean;
  /** Packaged manifest's specs match the registry (false = republish needed). */
  specsCurrent?: boolean;
}

/** Consume the package SSE stream, calling back on stage/log; rejects on error. */
async function streamPackage(
  body: { symbol: string; instrumentCode: string; pricePrecision: number; from?: string; to?: string },
  onStage: (s: string) => void,
  onLog: (line: string) => void
): Promise<void> {
  const token = await getIdToken();
  const res = await fetch('/api/symbols/package', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Packaging failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let err: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      const d = JSON.parse(data);
      if (event === 'stage') onStage(d.label);
      else if (event === 'log') onLog(d.line);
      else if (event === 'error') err = d.error;
    }
  }
  if (err) throw new Error(err);
}

export function DataManager({ onClose }: { onClose: () => void }) {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [runningSym, setRunningSym] = useState<string | null>(null);
  const [stage, setStage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('2022-01-01');
  const [toDate, setToDate] = useState('2025-12-31');

  const refresh = async () => {
    let packaged: Record<string, { packaged: boolean; specsCurrent?: boolean }> = {};
    try {
      packaged = (await (await fetch('/api/symbols')).json()).symbols ?? {};
    } catch {
      /* dev server may be restarting */
    }
    const next: Record<string, Status> = {};
    for (const s of SYMBOL_LIST) {
      next[s.symbol] = {
        packaged: packaged[s.symbol]?.packaged ?? false,
        specsCurrent: packaged[s.symbol]?.specsCurrent,
        seeded: await hasSymbol(s.symbol)
      };
    }
    setStatuses(next);
  };

  useEffect(() => {
    // post-effect tick: keeps setState out of the synchronous effect body
    void Promise.resolve().then(refresh);
     
  }, []);

  const wrap = async (sym: string, fn: () => Promise<void>) => {
    setRunningSym(sym);
    setError(null);
    setLogs([]);
    setStage('Starting…');
    try {
      await fn();
      await refresh();
      setStage('Ready ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('');
    } finally {
      setRunningSym(null);
    }
  };

  const downloadAndPackage = (s: SymbolInfo) =>
    wrap(s.symbol, async () => {
      await streamPackage(
        { symbol: s.symbol, instrumentCode: s.instrumentCode, pricePrecision: s.pricePrecision, from: fromDate, to: toDate },
        setStage,
        (line) => setLogs((p) => [...p.slice(-300), line])
      );
      // No seeding needed — charts load lazily from the packaged data.
    });

  // Optional: warm the entire local cache (charts never require this).
  const preload = (s: SymbolInfo) =>
    wrap(s.symbol, () => preloadSymbol(s.symbol, (p) => setStage(`Caching ${p.label} (${p.done}/${p.total})`)));

  const clearCache = (s: SymbolInfo) =>
    wrap(s.symbol, async () => {
      setStage('Clearing local cache…');
      await deleteSymbol(s.symbol);
      clearMemCache(s.symbol);
    });

  const busy = runningSym !== null;

  const badge = (st: Status | undefined) => {
    if (st?.packaged && st.specsCurrent === false)
      return (
        <span
          title="The packaged data carries different specs (precision/contract size) than the registry — re-download, or the nightly refresh will fix it"
          className="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-300"
        >
          Specs stale
        </span>
      );
    if (st?.seeded) return <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-300">Cached</span>;
    if (st?.packaged) return <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] text-blue-300">Ready</span>;
    return <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">Not packaged</span>;
  };

  return (
    <Modal onClose={onClose} ariaLabel="Market data" className="w-[620px]">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4" /> Market Data
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <p className="mb-2 text-[11px] text-slate-500">
            Download &amp; package candle data (Dukascopy) into the app and engine. A shorter range
            downloads faster. Instruments are defined once in{' '}
            <code className="text-slate-400">data-pipeline/instruments.json</code> — the web app,
            the engine and the nightly refresh all read that registry.
          </p>

          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="uppercase text-slate-500">Range</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={busy}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 [color-scheme:dark] disabled:opacity-50"
            />
            <span>→</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={busy}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 [color-scheme:dark] disabled:opacity-50"
            />
          </div>

          <div className="divide-y divide-slate-800 rounded border border-slate-800">
            {SYMBOL_LIST.map((s) => {
              const st = statuses[s.symbol];
              const isRunning = runningSym === s.symbol;
              return (
                <div key={s.symbol} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1">
                    <div className="text-sm">{s.label}</div>
                    <div className="text-[10px] text-slate-500">
                      <span className="uppercase">{s.assetClass}</span>
                      <span className="ml-2 font-mono">
                        {s.instrumentCode} · {s.pricePrecision}dp · lot {s.contractSize.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {badge(st)}
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <div className="flex gap-1">
                      {(!st?.packaged || st.specsCurrent === false) && (
                        <button
                          type="button"
                          onClick={() => downloadAndPackage(s)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-40"
                        >
                          <Download className="h-3 w-3" /> {st?.packaged ? 'Repackage' : 'Download'}
                        </button>
                      )}
                      {st?.packaged && (
                        <button
                          type="button"
                          onClick={() => preload(s)}
                          disabled={busy}
                          title="Optionally cache the full history locally (charts load on demand regardless)"
                          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700 disabled:opacity-40"
                        >
                          Preload
                        </button>
                      )}
                      {st?.seeded && (
                        <button
                          type="button"
                          onClick={() => clearCache(s)}
                          disabled={busy}
                          title="Clear this symbol's local cache (it refills lazily)"
                          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700 disabled:opacity-40"
                        >
                          <RefreshCw className="h-3 w-3" /> Clear cache
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {(stage || error || logs.length > 0) && (
            <div className="mt-3 rounded border border-slate-800 p-2">
              <div className="mb-1 flex items-center gap-2 text-xs">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />}
                <span className={error ? 'text-red-400' : 'text-slate-300'}>{error || stage}</span>
              </div>
              {logs.length > 0 && (
                <pre className="max-h-40 overflow-y-auto rounded bg-slate-950 p-2 text-[10px] leading-relaxed text-slate-400">
                  {logs.join('\n')}
                </pre>
              )}
            </div>
          )}
        </div>
    </Modal>
  );
}
