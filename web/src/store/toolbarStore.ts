import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Drawing-toolbar preferences: favorite tools (pinned to the rail), the
// last-used tool per group (the group button re-arms it), and drawing-mode
// flags (magnet / keep-drawing / lock-all / hide-all). Device-local by design
// (like theme), so localStorage persist is fine.

export type MagnetMode = 'off' | 'weak' | 'strong';

interface ToolbarState {
  favorites: string[]; // tool ids, in pin order
  lastUsed: Record<string, string>; // group -> tool id
  magnet: MagnetMode;
  keepDrawing: boolean;
  lockAll: boolean;
  hideAll: boolean;
  toggleFavorite: (id: string) => void;
  setLastUsed: (group: string, id: string) => void;
  cycleMagnet: () => void;
  toggleKeepDrawing: () => void;
  setLockAll: (on: boolean) => void;
  setHideAll: (on: boolean) => void;
}

const MAGNET_CYCLE: Record<MagnetMode, MagnetMode> = { off: 'weak', weak: 'strong', strong: 'off' };

export const useToolbarStore = create<ToolbarState>()(
  persist(
    (set) => ({
      favorites: [],
      lastUsed: {},
      magnet: 'off',
      keepDrawing: false,
      lockAll: false,
      hideAll: false,

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id]
        })),

      setLastUsed: (group, id) => set((s) => ({ lastUsed: { ...s.lastUsed, [group]: id } })),
      cycleMagnet: () => set((s) => ({ magnet: MAGNET_CYCLE[s.magnet] })),
      toggleKeepDrawing: () => set((s) => ({ keepDrawing: !s.keepDrawing })),
      setLockAll: (on) => set({ lockAll: on }),
      setHideAll: (on) => set({ hideAll: on })
    }),
    {
      name: 'forex-toolbar',
      version: 2,
      migrate: (persisted) => {
        // v1 stored magnet as a boolean.
        const s = persisted as Record<string, unknown>;
        if (typeof s?.magnet === 'boolean') s.magnet = s.magnet ? 'weak' : 'off';
        return s as unknown as ToolbarState;
      }
    }
  )
);
