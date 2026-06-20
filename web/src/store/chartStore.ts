import { create } from 'zustand';
import type { Chart } from 'klinecharts';

/**
 * Registry of the live KLineChart instances, one per layout pane, so the toolbar,
 * drawing rail, and plugin bridge can operate on them without prop-drilling.
 * `activePaneId` is the focused pane (target for the drawing rail); `activeTool`
 * is the overlay being drawn (so click-to-seek stands down). Transient.
 */
export interface PaneChart {
  chart: Chart;
  container: HTMLElement;
}

interface ChartState {
  charts: Record<string, PaneChart>;
  activePaneId: string | null;
  activeTool: string | null;
  registerChart: (paneId: string, chart: Chart, container: HTMLElement) => void;
  unregisterChart: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  setActiveTool: (tool: string | null) => void;
}

export const useChartStore = create<ChartState>((set) => ({
  charts: {},
  activePaneId: null,
  activeTool: null,

  registerChart: (paneId, chart, container) =>
    set((s) => ({
      charts: { ...s.charts, [paneId]: { chart, container } },
      activePaneId: s.activePaneId ?? paneId
    })),

  unregisterChart: (paneId) =>
    set((s) => {
      const charts = { ...s.charts };
      delete charts[paneId];
      const activePaneId =
        s.activePaneId === paneId ? (Object.keys(charts)[0] ?? null) : s.activePaneId;
      return { charts, activePaneId };
    }),

  setActivePane: (paneId) => set({ activePaneId: paneId }),
  setActiveTool: (tool) => set({ activeTool: tool })
}));

/** The focused pane's chart instance (for the drawing rail / toolbar actions). */
export function useActiveChart(): Chart | null {
  return useChartStore((s) => (s.activePaneId ? (s.charts[s.activePaneId]?.chart ?? null) : null));
}
