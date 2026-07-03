import { create } from 'zustand';
import { useReplayStore } from '@/store/replayStore';
import { defaultLayout, makePanes, type LayoutCount, type TabLayout } from '@/lib/layout';
import type { Timeframe } from '@/store/replayStore';

/** A workspace tab = one symbol, with its OWN layout and replay-head position. */
export interface Tab {
  id: string;
  symbol: string;
  label: string;
  pricePrecision: number;
  layout: TabLayout; // per-tab split/timeframes — independent of other tabs
  savedHead?: number; // replay head when last left, restored on return
  start?: number; // session window start (Unix ms); default = data start
  end?: number; // session window end (Unix ms); default = data end
}

interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string;
  view: 'home' | 'session'; // transient (not synced to Firestore): app always lands on Home
  addTab: (tab: Omit<Tab, 'id' | 'layout'>) => void;
  closeTab: (id: string) => void;
  selectTab: (id: string) => void;
  renameTab: (id: string, label: string) => void;
  setActiveCount: (count: LayoutCount) => void;
  setActivePaneTimeframe: (paneId: string, tf: Timeframe) => void;
  /** Open a session (from the Home dashboard) and switch to the trading view. */
  openSession: (id: string) => void;
  /** Return to the Home dashboard (session manager). */
  goHome: () => void;
  /** Replace the whole workspace (on load from Firestore). */
  hydrate: (tabs: Tab[], activeTabId: string) => void;
  /** Reset to a single default tab (on sign-out / account switch). */
  reset: () => void;
}

/** Snapshot the current replay head into the currently-active tab. */
function saveHead(tabs: Tab[], activeTabId: string): Tab[] {
  const head = useReplayStore.getState().currentTimestamp;
  return tabs.map((t) => (t.id === activeTabId ? { ...t, savedHead: head } : t));
}

/** Update the active tab via `fn` (immutably). */
function updateActive(tabs: Tab[], activeTabId: string, fn: (t: Tab) => Tab): Tab[] {
  return tabs.map((t) => (t.id === activeTabId ? fn(t) : t));
}

// In-memory; the per-user copy lives in Firestore (see WorkspaceSync). No
// localStorage persist so one account's tabs never bleed into another's.
// Zero sessions is a valid state — there is NO default session; with no tabs
// the app shows the Home dashboard's empty state (AppRoot guards the shell).
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
      tabs: [],
      activeTabId: '',
      view: 'home',

      addTab: (tab) =>
        set((s) => {
          const id = `tab-${tab.symbol}-${Date.now()}`;
          const tabs = saveHead(s.tabs, s.activeTabId);
          // Creating a session opens it (leaves the Home dashboard).
          return { tabs: [...tabs, { ...tab, id, layout: defaultLayout() }], activeTabId: id, view: 'session' };
        }),

      closeTab: (id) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          // Deleting the last session drops back to Home (nothing to render).
          if (tabs.length === 0) return { tabs, activeTabId: '', view: 'home' };
          const activeTabId = s.activeTabId === id ? tabs[0].id : s.activeTabId;
          return { tabs, activeTabId };
        }),

      selectTab: (id) =>
        set((s) => {
          if (id === s.activeTabId) return s;
          return { tabs: saveHead(s.tabs, s.activeTabId), activeTabId: id };
        }),

      renameTab: (id, label) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, label } : t)) })),

      setActiveCount: (count) =>
        set((s) => ({
          tabs: updateActive(s.tabs, s.activeTabId, (t) => ({
            ...t,
            layout: { count, panes: makePanes(count, t.layout.panes) }
          }))
        })),

      setActivePaneTimeframe: (paneId, tf) =>
        set((s) => ({
          tabs: updateActive(s.tabs, s.activeTabId, (t) => ({
            ...t,
            layout: {
              ...t.layout,
              panes: t.layout.panes.map((p) => (p.id === paneId ? { ...p, timeframe: tf } : p))
            }
          }))
        })),

      openSession: (id) =>
        set((s) => ({
          tabs: id === s.activeTabId ? s.tabs : saveHead(s.tabs, s.activeTabId),
          activeTabId: id,
          view: 'session'
        })),

      goHome: () => set((s) => ({ tabs: saveHead(s.tabs, s.activeTabId), view: 'home' })),

      hydrate: (tabs, activeTabId) =>
        set({
          tabs: tabs.map((t) => ({ ...t, layout: t.layout ?? defaultLayout() })),
          activeTabId: tabs.some((t) => t.id === activeTabId) ? activeTabId : (tabs[0]?.id ?? '')
        }),

      reset: () => set({ tabs: [], activeTabId: '', view: 'home' })
    })
);

/**
 * The currently active tab (falls back to the first tab). Only call from the
 * session view: AppRoot never renders it with zero tabs, so this is non-null
 * there. With no tabs it returns undefined at runtime.
 */
export function useActiveTab(): Tab {
  return useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]);
}
