'use client';

import { useEffect, useRef } from 'react';
import { useUserPluginsStore } from '@/store/userPluginsStore';
import { registerChartPlugin, unregisterChartPlugin } from '@/lib/plugins/registry';
import { compileUserPlugin } from '@/lib/plugins/compile';

/**
 * Keeps the plugin registry in sync with user-authored plugins: compiles +
 * (re)registers each one, and unregisters any that were deleted. Renders nothing.
 */
export function UserPluginsLoader() {
  const plugins = useUserPluginsStore((s) => s.plugins);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(Object.keys(plugins));
    for (const up of Object.values(plugins)) {
      registerChartPlugin(compileUserPlugin(up));
    }
    for (const id of prevIdsRef.current) {
      if (!current.has(id)) unregisterChartPlugin(id);
    }
    prevIdsRef.current = current;
  }, [plugins]);

  return null;
}
