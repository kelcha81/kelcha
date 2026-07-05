import { usePluginStore } from '@/store/pluginStore';
import { BUILTIN_PLUGINS } from './builtins';
import { registerICT } from './ict';
import type { ChartPlugin } from './types';

// Registers built-in plugins' metadata into the plugin store (for the UI/toggles)
// and keeps a lookup of the executable ChartPlugin objects for the chart bridge.

const byId = new Map<string, ChartPlugin>();
let initialized = false;

export function initPlugins(): void {
  if (initialized) return;
  initialized = true;

  registerICT(); // register the ICT Killzones custom indicator before any createIndicator
  const { register } = usePluginStore.getState();
  for (const plugin of BUILTIN_PLUGINS) {
    byId.set(plugin.meta.id, plugin);
    register(plugin.meta, plugin.defaultEnabled ?? false);
  }
}

export function allPlugins(): ChartPlugin[] {
  return [...byId.values()];
}

export function getPlugin(id: string): ChartPlugin | undefined {
  return byId.get(id);
}

/** Register (or replace) a runtime plugin — used for user-authored plugins. */
export function registerChartPlugin(plugin: ChartPlugin): void {
  byId.set(plugin.meta.id, plugin);
  usePluginStore.getState().register(plugin.meta, plugin.defaultEnabled ?? false);
}

export function unregisterChartPlugin(id: string): void {
  byId.delete(id);
  usePluginStore.getState().unregister(id);
}
