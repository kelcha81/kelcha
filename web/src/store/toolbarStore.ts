import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Drawing-toolbar preferences: favorite tools (pinned to the rail), the
// last-used tool per group (the group button re-arms it), and drawing-mode
// flags (magnet / keep-drawing — wired up in the drawing power-UX phase).
// Device-local by design (like theme), so localStorage persist is fine.

interface ToolbarState {
  favorites: string[]; // tool ids, in pin order
  lastUsed: Record<string, string>; // group -> tool id
  magnet: boolean;
  keepDrawing: boolean;
  toggleFavorite: (id: string) => void;
  setLastUsed: (group: string, id: string) => void;
  setMagnet: (on: boolean) => void;
  setKeepDrawing: (on: boolean) => void;
}

export const useToolbarStore = create<ToolbarState>()(
  persist(
    (set) => ({
      favorites: [],
      lastUsed: {},
      magnet: false,
      keepDrawing: false,

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id]
        })),

      setLastUsed: (group, id) => set((s) => ({ lastUsed: { ...s.lastUsed, [group]: id } })),
      setMagnet: (on) => set({ magnet: on }),
      setKeepDrawing: (on) => set({ keepDrawing: on })
    }),
    { name: 'forex-toolbar' }
  )
);
