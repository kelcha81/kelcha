import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserPlugin {
  id: string;
  name: string;
  code: string; // body of attach(ctx); returns a cleanup function
  rev: number; // bumped on each save to force re-attach
}

interface UserPluginsState {
  plugins: Record<string, UserPlugin>;
  /** Create (no id) or update (id). Returns the plugin id. */
  upsert: (p: { id?: string; name: string; code: string }) => string;
  remove: (id: string) => void;
}

let counter = 0;
const newId = () => `up-${Date.now().toString(36)}${(counter++).toString(36)}`;

export const useUserPluginsStore = create<UserPluginsState>()(
  persist(
    (set) => ({
      plugins: {},

      upsert: ({ id, name, code }) => {
        const pid = id ?? newId();
        set((s) => {
          const prev = s.plugins[pid];
          return { plugins: { ...s.plugins, [pid]: { id: pid, name, code, rev: (prev?.rev ?? 0) + 1 } } };
        });
        return pid;
      },

      remove: (id) =>
        set((s) => {
          const plugins = { ...s.plugins };
          delete plugins[id];
          return { plugins };
        })
    }),
    { name: 'forex-user-plugins' }
  )
);
