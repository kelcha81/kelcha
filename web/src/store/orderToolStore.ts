import { create } from 'zustand';

export type OrderField = 'entry' | 'sl' | 'tp';

/**
 * The order being composed: entry (null = market at live price), stop, target,
 * and which level (if any) is currently being "picked" from the chart. When a
 * pick is armed, the next click on a chart sets that level's price.
 */
interface OrderToolState {
  entry: number | null;
  sl: number | null;
  tp: number | null;
  lots: number; // current ticket size, mirrored so the position overlay can show qty/amounts
  pick: OrderField | null;
  setPick: (f: OrderField | null) => void;
  setValue: (f: OrderField, v: number) => void;
  clearField: (f: OrderField) => void;
  setLots: (n: number) => void;
  reset: () => void;
}

export const useOrderToolStore = create<OrderToolState>((set) => ({
  entry: null,
  sl: null,
  tp: null,
  lots: 0.1,
  pick: null,
  setPick: (f) => set((s) => ({ pick: s.pick === f ? null : f })),
  setValue: (f, v) => set({ [f]: v } as Partial<OrderToolState>),
  clearField: (f) => set({ [f]: null } as Partial<OrderToolState>),
  setLots: (n) => set({ lots: n }),
  reset: () => set((s) => ({ entry: null, sl: null, tp: null, pick: null, lots: s.lots }))
}));
