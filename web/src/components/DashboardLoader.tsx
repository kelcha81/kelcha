'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { getBounds, getRange } from '@/lib/candleSource';

// Longest market-closed stretch to look across when snapping the head to real
// data (forex: a weekend plus an adjoining holiday ~= 3 days).
const MAX_GAP_MS = 4 * 24 * 60 * 60 * 1000;

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

  // Load state is keyed by tab id: switching tabs makes the previous state
  // stale by derivation, so the effect never needs synchronous resets.
  const [load, setLoad] = useState<{ tabId: string; ready: boolean; error: string | null } | null>(null);
  const [stalledFor, setStalledFor] = useState<string | null>(null);

  const forTab = load && load.tabId === activeTabId ? load : null;
  const ready = !!forTab?.ready;
  const error = forTab?.error ?? null;
  const stalled = stalledFor === activeTabId && !ready;

  // Watchdog: surface a hint if loading stalls (network or a locked IndexedDB).
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setStalledFor(activeTabId), 8000);
    return () => clearTimeout(id);
  }, [ready, activeTabId]);

  useEffect(() => {
    let cancelled = false;
    const tab = useWorkspaceStore.getState().tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    (async () => {
      const bounds = await getBounds(tab.symbol);
      if (!bounds) throw new Error(`No packaged data found for ${tab.symbol}`);

      // Snap the head to the first real bar at/after the requested start. A
      // session that begins in a market-closed gap (e.g. a Jan-1 holiday, or a
      // weekend) would otherwise park the head in dead air where nothing forms
      // and playback looks frozen until the market reopens hours/days later.
      const wanted = tab.savedHead ?? tab.start ?? bounds.min;
      let startTs = wanted;
      try {
        const probe = await getRange(tab.symbol, 'm1', wanted, Math.min(bounds.max, wanted + MAX_GAP_MS));
        if (probe.length && probe[0].timestamp > wanted) startTs = probe[0].timestamp;
      } catch {
        /* keep `wanted` if the probe fetch fails — bounds still let it play */
      }
      if (cancelled) return;

      setSession(tab.symbol, bounds, {
        start: tab.start,
        end: tab.end,
        startTs
      });
      setLoad({ tabId: activeTabId, ready: true, error: null });
    })().catch((e: unknown) => {
      if (!cancelled)
        setLoad({ tabId: activeTabId, ready: false, error: e instanceof Error ? e.message : String(e) });
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
