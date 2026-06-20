'use client';

import { useEffect, useRef } from 'react';
import { useChartStore } from '@/store/chartStore';
import { usePluginStore } from '@/store/pluginStore';
import { useActiveTab } from '@/store/workspaceStore';
import { initPlugins, allPlugins } from '@/lib/plugins/registry';

/**
 * Reconciles enabled plugins against every pane's chart: attaches a plugin to a
 * chart when it's on, detaches when it's off or the chart goes away. Renders
 * nothing. Keyed by chart id + symbol so a remounted chart (timeframe change) or
 * a symbol change re-attaches correctly.
 */
export function ChartPluginsBridge() {
  const charts = useChartStore((s) => s.charts);
  const enabled = usePluginStore((s) => s.enabled);
  const params = usePluginStore((s) => s.params);
  const registered = usePluginStore((s) => s.registered);
  const { symbol } = useActiveTab();

  // key `${chartId}:${symbol}:${pluginId}` -> detach()
  const activeRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    initPlugins();
  }, []);

  useEffect(() => {
    const active = activeRef.current;
    const want = new Set<string>();

    for (const { chart, container } of Object.values(charts)) {
      for (const plugin of allPlugins()) {
        if (!enabled[plugin.meta.id]) continue;
        const p = params[plugin.meta.id] ?? plugin.params?.defaults;
        const key = `${chart.id}:${symbol}:${plugin.meta.id}:${plugin.rev ?? 0}:${p ? p.join(',') : ''}`;
        want.add(key);
        if (!active.has(key)) {
          try {
            active.set(key, plugin.attach({ chart, container, symbol }, p));
          } catch {
            /* ignore attach failure */
          }
        }
      }
    }

    // Detach anything no longer wanted (disabled, chart removed/remounted, symbol changed).
    for (const key of [...active.keys()]) {
      if (!want.has(key)) {
        try {
          active.get(key)?.();
        } catch {
          /* chart may be disposed */
        }
        active.delete(key);
      }
    }
  }, [charts, enabled, symbol, params, registered]);

  useEffect(() => {
    const active = activeRef.current;
    return () => {
      active.forEach((off) => {
        try {
          off();
        } catch {
          /* noop */
        }
      });
      active.clear();
    };
  }, []);

  return null;
}
