'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { seedSymbol, type SeedProgress } from '@/lib/seed';
import { getBounds } from '@/lib/candleSource';

/**
 * Seeds the active tab's symbol into IndexedDB on first run (progress bar), reads
 * its bounds, and starts a replay session — restoring that tab's saved head.
 * Re-runs whenever the active tab changes. Candles load in windows via the
 * CandleSource, not here.
 */
export function DashboardLoader({ children }: { children: ReactNode }) {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const { symbol } = useActiveTab();
  const setSession = useReplayStore((s) => s.setSession);

  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);

  // Watchdog: surface a hint if loading stalls (usually a locked IndexedDB).
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setStalled(true), 8000);
    return () => clearTimeout(id);
  }, [ready, progress, activeTabId]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    setProgress(null);
    setStalled(false);

    const tab = useWorkspaceStore.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    (async () => {
      await seedSymbol(tab.symbol, (p) => {
        if (!cancelled) setProgress(p);
      });
      const bounds = await getBounds(tab.symbol);
      if (!bounds) throw new Error(`No data bounds found for ${tab.symbol}`);
      if (!cancelled) {
        setSession(tab.symbol, bounds, {
          start: tab.start,
          end: tab.end,
          startTs: tab.savedHead
        });
        setReady(true);
      }
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });

    return () => {
      cancelled = true;
    };
  }, [activeTabId, setSession]);

  if (error) {
    return <div className="p-4 text-red-400">Failed to load market data: {error}</div>;
  }

  if (!ready) {
    const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="p-4 text-slate-400">
        <div className="mb-2">
          {progress
            ? `Seeding ${symbol.toUpperCase()} into IndexedDB… ${progress.label}`
            : 'Loading market data…'}
        </div>
        <div className="h-2 w-64 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {progress && (
          <div className="mt-1 text-xs">
            {progress.done}/{progress.total}
          </div>
        )}
        {stalled && !progress && (
          <div className="mt-3 max-w-sm text-xs text-amber-400">
            Still preparing… If this doesn&apos;t move, the local database may be locked by
            another open tab. Close other tabs of this app, or clear this site&apos;s IndexedDB
            (DevTools → Application → IndexedDB → delete <code>forex-replay-data</code>), then reload.
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
