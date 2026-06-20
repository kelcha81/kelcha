import type { Timeframe } from '@/store/replayStore';

export type LayoutCount = 1 | 2 | 4;

export interface Pane {
  id: string;
  timeframe: Timeframe;
}

export interface TabLayout {
  count: LayoutCount;
  panes: Pane[];
}

// Stable pane ids (pane-1..4) with sensible default timeframes per slot.
const DEFAULT_TFS: Timeframe[] = ['h1', 'm15', 'h4', 'd1'];

/** Build `n` panes, preserving prior panes' timeframes by slot where possible. */
export function makePanes(n: number, prev?: Pane[]): Pane[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `pane-${i + 1}`,
    timeframe: prev?.[i]?.timeframe ?? DEFAULT_TFS[i] ?? 'h1'
  }));
}

/** A fresh default layout (factory, so tabs never share a layout object). */
export function defaultLayout(): TabLayout {
  return { count: 1, panes: makePanes(1) };
}
