'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTradingStore } from '@/store/tradingStore';
import { useBacktestStore } from '@/store/backtestStore';
import { loadWorkspace, saveWorkspace } from '@/lib/workspaceData';
import { runSync } from '@/store/syncStore';

// Syncs the user's workspace (tabs + paper trades + saved backtests) with
// Firestore: clears + loads on sign-in, saves (debounced) on change, clears on
// sign-out. The clear-first keeps accounts isolated on a shared browser.
export function WorkspaceSync() {
  const { user } = useAuth();
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    // Always start clean so one account never shows another's data.
    useWorkspaceStore.getState().reset();
    useTradingStore.getState().reset();
    useBacktestStore.getState().reset();
    if (!user) return;

    let active = true;
    (async () => {
      const ws = await loadWorkspace(user.uid);
      if (!active) return;
      if (ws) {
        useWorkspaceStore.getState().hydrate(ws.tabs ?? [], ws.activeTabId ?? '');
        if (ws.trading) useTradingStore.setState(ws.trading);
      }
      await useBacktestStore.getState().hydrate();
    })()
      .catch(() => {})
      .finally(() => {
        if (active) loaded.current = true;
      });

    return () => {
      active = false;
    };
  }, [user]);

  // Debounced save of tabs + trading whenever either changes.
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      if (!loaded.current) return;
      clearTimeout(t);
      t = setTimeout(() => {
        // runSync surfaces failures (toast + status chip) and retries with
        // backoff; the closure re-reads state so a retry writes the latest.
        runSync('workspace', () => {
          const ws = useWorkspaceStore.getState();
          const tr = useTradingStore.getState();
          return saveWorkspace(user.uid, {
            tabs: ws.tabs,
            activeTabId: ws.activeTabId,
            trading: { positions: tr.positions, pending: tr.pending, trades: tr.trades, accounts: tr.accounts }
          });
        });
      }, 1000);
    };
    const unsubWs = useWorkspaceStore.subscribe(save);
    const unsubTr = useTradingStore.subscribe(save);
    return () => {
      clearTimeout(t);
      unsubWs();
      unsubTr();
    };
  }, [user]);

  return null;
}
