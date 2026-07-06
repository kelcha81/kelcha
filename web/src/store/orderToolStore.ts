import { create } from 'zustand';
import type { Side } from '@/store/tradingStore';

export type OrderField = 'entry' | 'sl' | 'tp';

/**
 * The order being composed: entry (null = market at live price), stop, target,
 * side, and which level (if any) is being "picked" from the chart. When
 * `projecting` is true, a live on-chart order projection is showing (opened by
 * the Long/Short position tool) and the panel offers Place / Cancel; dragging
 * the projection edits these values and vice-versa (bidirectional).
 */
interface OrderToolState {
  entry: number | null;
  sl: number | null;
  tp: number | null;
  side: Side;
  lots: number; // current ticket size, mirrored so the projection can show qty/amounts
  pick: OrderField | null;
  projecting: boolean;
  setPick: (f: OrderField | null) => void;
  setValue: (f: OrderField, v: number) => void;
  clearField: (f: OrderField) => void;
  setLots: (n: number) => void;
  setSide: (s: Side) => void;
  /** Open a chart order projection from drawn entry/stop/target. */
  beginProjection: (o: { entry: number; sl: number | null; tp: number | null; side: Side }) => void;
  /** Discard the composed order + projection (keeps lots + side). */
  cancel: () => void;
  reset: () => void;
}

export const useOrderToolStore = create<OrderToolState>((set) => ({
  entry: null,
  sl: null,
  tp: null,
  side: 'long',
  lots: 0.1,
  pick: null,
  projecting: false,
  setPick: (f) => set((s) => ({ pick: s.pick === f ? null : f })),
  setValue: (f, v) => set({ [f]: v } as Partial<OrderToolState>),
  clearField: (f) => set({ [f]: null } as Partial<OrderToolState>),
  setLots: (n) => set({ lots: n }),
  setSide: (side) => set({ side }),
  beginProjection: ({ entry, sl, tp, side }) => set({ entry, sl, tp, side, projecting: true, pick: null }),
  cancel: () => set((s) => ({ entry: null, sl: null, tp: null, pick: null, projecting: false, lots: s.lots, side: s.side })),
  reset: () => set((s) => ({ entry: null, sl: null, tp: null, pick: null, projecting: false, lots: s.lots, side: s.side }))
}));
