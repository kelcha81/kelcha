import { create } from 'zustand';

// Controls the persistent Journal/Forecast dock in the right rail. Not persisted
// — it's session UI state (which tab, open/closed).
interface JournalDockState {
  open: boolean;
  tab: 'journal' | 'forecast';
  show: (tab: 'journal' | 'forecast') => void;
  hide: () => void;
}

export const useJournalDock = create<JournalDockState>((set) => ({
  open: false,
  tab: 'journal',
  show: (tab) => set({ open: true, tab }),
  hide: () => set({ open: false })
}));
