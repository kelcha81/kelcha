import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PluginType = 'indicator' | 'drawing' | 'overlay' | 'custom';

export interface PluginMeta {
  id: string;
  name: string;
  type: PluginType;
  description?: string;
}

interface PluginState {
  /** Registered at runtime (not persisted — re-registered on every load). */
  registered: Record<string, PluginMeta>;
  /** Enabled flags (persisted) keyed by plugin id. */
  enabled: Record<string, boolean>;
  /** Per-plugin numeric params (persisted), keyed by plugin id. */
  params: Record<string, number[]>;
  register: (meta: PluginMeta, defaultEnabled?: boolean) => void;
  unregister: (id: string) => void;
  setEnabled: (id: string, value: boolean) => void;
  toggle: (id: string) => void;
  setParams: (id: string, params: number[]) => void;
}

/**
 * The cross-cutting plugin registry. Every extension (indicators, drawing tools,
 * overlays, user plugins) registers here and can be toggled on/off and (for
 * indicators) configured. Only enabled-state + params are persisted; code
 * re-registers metadata on load.
 */
export const usePluginStore = create<PluginState>()(
  persist(
    (set) => ({
      registered: {},
      enabled: {},
      params: {},

      register: (meta, defaultEnabled = false) =>
        set((s) => ({
          registered: { ...s.registered, [meta.id]: meta },
          enabled: meta.id in s.enabled ? s.enabled : { ...s.enabled, [meta.id]: defaultEnabled }
        })),

      unregister: (id) =>
        set((s) => {
          const registered = { ...s.registered };
          delete registered[id];
          return { registered };
        }),

      setEnabled: (id, value) => set((s) => ({ enabled: { ...s.enabled, [id]: value } })),
      toggle: (id) => set((s) => ({ enabled: { ...s.enabled, [id]: !s.enabled[id] } })),
      setParams: (id, params) => set((s) => ({ params: { ...s.params, [id]: params } }))
    }),
    {
      name: 'forex-plugins',
      partialize: (s) => ({ enabled: s.enabled, params: s.params })
    }
  )
);
