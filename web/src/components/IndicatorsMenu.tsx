'use client';

import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePluginStore } from '@/store/pluginStore';
import { initPlugins, getPlugin } from '@/lib/plugins/registry';
import { MenuPopover } from '@/components/ui/menu';

/**
 * Dropdown listing all plugins: toggle on/off, and (for indicators) edit their
 * calc params. Changes persist and re-apply to every pane's chart live.
 */
export function IndicatorsMenu() {
  useEffect(() => {
    initPlugins();
  }, []);

  const registered = usePluginStore((s) => s.registered);
  const enabled = usePluginStore((s) => s.enabled);
  const params = usePluginStore((s) => s.params);
  const toggle = usePluginStore((s) => s.toggle);
  const setParams = usePluginStore((s) => s.setParams);

  const list = Object.values(registered);
  const onCount = list.filter((m) => enabled[m.id]).length;

  return (
    <MenuPopover
      title="Indicators"
      trigger={
        <>
          Indicators{onCount > 0 ? ` (${onCount})` : ''}
          <ChevronDown className="h-3 w-3" />
        </>
      }
    >
      {list.map((meta) => {
            const plugin = getPlugin(meta.id);
            const on = !!enabled[meta.id];
            const schema = plugin?.params;
            const values = params[meta.id] ?? schema?.defaults ?? [];
            return (
              <div key={meta.id} className="rounded px-1 py-1 hover:bg-slate-800/60">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-sm text-slate-200">{meta.name}</span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(meta.id)}
                    data-testid={`plugin-toggle-${meta.id}`}
                    className="h-4 w-4 accent-blue-600"
                  />
                </label>
                {on && schema && (
                  <div className="mt-1 flex flex-wrap gap-2 pl-1">
                    {schema.labels.map((label, i) => (
                      <label key={label} className="flex items-center gap-1 text-[11px] text-slate-400">
                        {label}
                        <input
                          type="number"
                          min={1}
                          value={values[i] ?? schema.defaults[i]}
                          onChange={(e) => {
                            const base = values.length ? values : schema.defaults;
                            const next = [...base];
                            next[i] = Number(e.target.value);
                            setParams(meta.id, next);
                          }}
                          className="w-12 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs text-slate-100"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
    </MenuPopover>
  );
}
