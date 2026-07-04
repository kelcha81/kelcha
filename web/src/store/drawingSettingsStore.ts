import { create } from 'zustand';
import type { Chart } from 'klinecharts';

// Which drawing (if any) has its Settings dialog open. Opened from the floating
// toolbar's gear, the context menu, or a double-click on the drawing.
export interface DrawingSettingsTarget {
  chart: Chart;
  overlayId: string;
  paneKey: string | null;
  name: string;
}

interface DrawingSettingsState {
  target: DrawingSettingsTarget | null;
  openSettings: (t: DrawingSettingsTarget) => void;
  closeSettings: () => void;
}

export const useDrawingSettingsStore = create<DrawingSettingsState>((set) => ({
  target: null,
  openSettings: (target) => set({ target }),
  closeSettings: () => set({ target: null })
}));
