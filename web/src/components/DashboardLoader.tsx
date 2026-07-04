'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { getBounds } from '@/lib/candleSource';

/**
 * Starts a replay session for the active tab: reads the symbol's bounds from
 * the server manifest (instant — no seeding) and parks the head at the tab's
 * saved position. Candles load lazily in windows via the CandleSource as the
 * charts request them.
 */
export function DashboardLoader({ children }: { children: ReactNode }) {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const { symbol } = useActiveTab();
  const setSession = useReplayStore((s) => s.setSession);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);

  // Watchdog: surface a hint if loading stalls (network or a locked IndexedDB).
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setStalled(true), 8000);
    return () => clearTimeout(id);
  }, [ready, activeTabId]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    setStalled(false);

    const tab = useWorkspaceStore.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    (async () => {
      const bounds = await getBounds(tab.symbol);
      if (!bounds) throw new Error(`No packaged data found for ${tab.symbol}`);
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
    return (
      <div className="p-4 text-slate-400">
        <div className="mb-2">Loading {symbol.toUpperCase()}…</div>
        {stalled && (
          <div className="mt-3 max-w-sm text-xs text-amber-400">
            Still preparing… Check your connection; if it persists, the local database may be
            locked by another open tab of this app.
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
