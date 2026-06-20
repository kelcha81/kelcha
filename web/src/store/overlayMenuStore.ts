import { create } from 'zustand';
import type { Chart, Overlay } from 'klinecharts';

// Track the real cursor position (capture phase, so it's current the instant a
// right-click fires) — KLineChart's overlay event doesn't reliably carry page
// coordinates, so we position the menu from this instead.
let lastX = 0;
let lastY = 0;
if (typeof window !== 'undefined') {
  const track = (e: MouseEvent) => {
    lastX = e.clientX;
    lastY = e.clientY;
  };
  window.addEventListener('mousemove', track, true);
  window.addEventListener('mousedown', track, true);
}

/**
 * Transient state for the right-click context menu shown over any overlay
 * (trade box, drawing, annotation). Holds the chart + overlay it targets so the
 * menu's actions (settings / clone / lock / remove) can act without lookups.
 */
export interface OverlaySelection {
  chart: Chart;
  id: string;
  paneKey: string | null;
}

interface OverlayMenuState {
  open: boolean;
  x: number;
  y: number;
  chart: Chart | null;
  overlay: Overlay | null;
  paneKey: string | null; // set for persisted drawings, null for ephemeral overlays
  selected: OverlaySelection | null; // last overlay the user selected (for Delete key)
  openMenu: (p: { chart: Chart; overlay: Overlay; paneKey: string | null }) => void;
  close: () => void;
  setSelected: (s: OverlaySelection | null) => void;
}

export const useOverlayMenuStore = create<OverlayMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  chart: null,
  overlay: null,
  paneKey: null,
  selected: null,
  openMenu: (p) => set({ open: true, x: lastX, y: lastY, ...p }),
  close: () => set({ open: false }),
  setSelected: (selected) => set({ selected })
}));
