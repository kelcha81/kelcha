import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** A persisted overlay: its KLineChart name + points (in data space). */
export interface SavedOverlay {
  id: string;
  name: string;
  points: Array<Partial<{ dataIndex: number; timestamp: number; value: number }>>;
  extendData?: Record<string, unknown>; // e.g. text content for annotations
  styles?: Record<string, unknown>; // colour / width / line style overrides
}

interface DrawingsState {
  /** keyed by `${tabId}:${paneId}` -> overlays drawn on that pane */
  drawings: Record<string, SavedOverlay[]>;
  upsert: (key: string, overlay: SavedOverlay) => void;
  remove: (key: string, id: string) => void;
  clear: (key: string) => void;
  /** Replace the whole map (on load from Firestore via DrawingsSync). */
  hydrate: (all: Record<string, SavedOverlay[]>) => void;
  /** Wipe all drawings (on sign-out / account switch) for isolation. */
  reset: () => void;
}

export const useDrawingsStore = create<DrawingsState>()(
  persist(
    (set) => ({
      drawings: {},

      upsert: (key, overlay) =>
        set((s) => {
          const list = s.drawings[key] ?? [];
          const exists = list.some((o) => o.id === overlay.id);
          const next = exists ? list.map((o) => (o.id === overlay.id ? overlay : o)) : [...list, overlay];
          return { drawings: { ...s.drawings, [key]: next } };
        }),

      remove: (key, id) =>
        set((s) => ({
          drawings: { ...s.drawings, [key]: (s.drawings[key] ?? []).filter((o) => o.id !== id) }
        })),

      clear: (key) => set((s) => ({ drawings: { ...s.drawings, [key]: [] } })),

      hydrate: (all) => set({ drawings: all }),
      reset: () => set({ drawings: {} })
    }),
    // localStorage stays as a same-device cache (instant restore on chart
    // mount); DrawingsSync layers per-user Firestore on top.
    { name: 'forex-drawings' }
  )
);
