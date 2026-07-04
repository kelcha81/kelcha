'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useDrawingsStore } from '@/store/drawingsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useChartStore } from '@/store/chartStore';
import { loadAllDrawings, saveTabDrawings, removeTabDrawings, groupByTab, splitKey } from '@/lib/drawingsData';
import { resyncOverlays } from '@/lib/overlays';
import { runSync } from '@/store/syncStore';

// Syncs per-user drawings with Firestore (one doc per session tab), mirroring
// WorkspaceSync: clear + load on sign-in, debounced per-tab save on change,
// delete a tab's doc when the session closes, clear on sign-out. localStorage
// (drawingsStore persist) stays as a same-device cache for instant restore.
//
// One-time migration (per browser): if a signed-in user has NO remote drawings
// but the local cache has some, adopt + upload them. Guarded by a browser flag
// so a second account on the same browser can't inherit the first's cache.
const MIGRATED_FLAG = 'forex-drawings-migrated';

export function DrawingsSync() {
  const { user } = useAuth();
  const loaded = useRef(false);
  const lastSaved = useRef<Record<string, string>>({});

  // Load on sign-in / clear on sign-out (with account isolation).
  useEffect(() => {
    loaded.current = false;
    lastSaved.current = {};
    // Capture the local cache BEFORE clearing (for one-time migration).
    const local = { ...useDrawingsStore.getState().drawings };
    useDrawingsStore.getState().reset();
    if (!user) return;

    let active = true;
    (async () => {
      const remote = await loadAllDrawings(user.uid);
      if (!active) return;

      const hasRemote = Object.keys(remote).length > 0;
      const migrated = typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATED_FLAG) === '1';
      const localTabs = groupByTab(local);

      const prev = useDrawingsStore.getState().drawings; // {} after reset
      if (!hasRemote && !migrated && localTabs.size > 0) {
        // Adopt the local cache and push it up once.
        useDrawingsStore.getState().hydrate(local);
        for (const [tabId, panes] of localTabs) {
          runSync(`drawings:${tabId}`, () => saveTabDrawings(user.uid, tabId, panes));
        }
      } else {
        useDrawingsStore.getState().hydrate(remote);
      }
      if (typeof localStorage !== 'undefined') localStorage.setItem(MIGRATED_FLAG, '1');

      // Re-apply to any charts already mounted (reload-into-session, esp. a new
      // device where the local cache was empty). Normal sign-in lands on Home
      // with no charts, so this is a no-op then.
      const charts = Object.fromEntries(Object.entries(useChartStore.getState().charts).map(([id, c]) => [id, c.chart]));
      resyncOverlays(charts, useWorkspaceStore.getState().activeTabId, prev);
    })()
      .catch(() => {})
      .finally(() => {
        if (active) loaded.current = true;
      });

    return () => {
      active = false;
    };
  }, [user]);

  // Debounced per-tab save on drawing changes (only tabs whose content changed).
  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      if (!loaded.current) return;
      clearTimeout(t);
      t = setTimeout(() => {
        const byTab = groupByTab(useDrawingsStore.getState().drawings);
        for (const [tabId, panes] of byTab) {
          const json = JSON.stringify(panes);
          if (lastSaved.current[tabId] === json) continue;
          lastSaved.current[tabId] = json;
          runSync(`drawings:${tabId}`, () => saveTabDrawings(user.uid, tabId, panes));
        }
      }, 1000);
    };
    const unsub = useDrawingsStore.subscribe(save);
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [user]);

  // Delete a tab's drawings doc when its session is closed.
  useEffect(() => {
    if (!user) return;
    const onWorkspace = () => {
      if (!loaded.current) return;
      const liveTabs = new Set(useWorkspaceStore.getState().tabs.map((tb) => tb.id));
      const store = useDrawingsStore.getState();
      const staleTabs = new Set<string>();
      for (const key of Object.keys(store.drawings)) {
        const [tabId] = splitKey(key);
        if (!liveTabs.has(tabId)) staleTabs.add(tabId);
      }
      for (const tabId of staleTabs) {
        for (const key of Object.keys(store.drawings)) {
          if (splitKey(key)[0] === tabId) store.clear(key);
        }
        delete lastSaved.current[tabId];
        runSync(`drawings:${tabId}`, () => removeTabDrawings(user.uid, tabId));
      }
    };
    const unsub = useWorkspaceStore.subscribe(onWorkspace);
    return () => unsub();
  }, [user]);

  return null;
}
