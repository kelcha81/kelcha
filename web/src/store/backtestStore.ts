import { create } from 'zustand';
import type { BacktestStats, BacktestTrade, IctAnnotation } from '@/lib/strategyApi';
import { getAllBacktests, putBacktest, deleteBacktest } from '@/lib/idb';

// Latest backtest result PER session tab, so it survives closing the Strategies
// modal, switching tabs, AND a full reload — persisted to IndexedDB (keyed by the
// persisted tabId), which handles the large annotation sets localStorage can't.
// Kept until a new strategy is run for that tab.

export type VizKey = 'showZones' | 'showLiquidity' | 'showStructure' | 'showTrades';

export interface BacktestResultData {
  symbol: string;
  strategy: string;
  timeframe: string;
  stats: BacktestStats;
  equity: { timestamp: number; equity: number }[];
  annotations: IctAnnotation[];
  trades: BacktestTrade[];
  ranAt: number;
}

interface BacktestVizState {
  results: Record<string, BacktestResultData>; // by tabId
  selected: Record<string, string | null>;     // selected trade id, by tabId
  showZones: boolean;       // fvg, order_block
  showLiquidity: boolean;   // liquidity, liquidity_sweep
  showStructure: boolean;   // bos, mss
  showTrades: boolean;
  setResult: (tabId: string, data: BacktestResultData) => void;
  clear: (tabId: string) => void;
  select: (tabId: string, tradeId: string | null) => void;
  toggle: (key: VizKey) => void;
  hydrate: () => Promise<void>;
}

export const useBacktestStore = create<BacktestVizState>((set) => ({
  results: {},
  selected: {},
  showZones: true,
  showLiquidity: true,
  showStructure: true,
  showTrades: true,
  setResult: (tabId, data) => {
    set((s) => ({
      results: { ...s.results, [tabId]: data },
      selected: { ...s.selected, [tabId]: null }
    }));
    void putBacktest(tabId, data).catch(() => {});
  },
  clear: (tabId) => {
    set((s) => {
      const results = { ...s.results };
      const selected = { ...s.selected };
      delete results[tabId];
      delete selected[tabId];
      return { results, selected };
    });
    void deleteBacktest(tabId).catch(() => {});
  },
  select: (tabId, tradeId) => set((s) => ({ selected: { ...s.selected, [tabId]: tradeId } })),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<BacktestVizState>),
  // Load persisted results on app start; in-memory results (from a run this
  // session) win over the stored copy.
  hydrate: async () => {
    try {
      const stored = await getAllBacktests<BacktestResultData>();
      set((s) => ({ results: { ...stored, ...s.results } }));
    } catch {
      /* IDB unavailable — stay in-memory */
    }
  }
}));
