'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { usePluginStore } from '@/store/pluginStore';
import { initPlugins, getPlugin } from '@/lib/plugins/registry';
import { useClickOutside } from '@/hooks/useClickOutside';

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

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const list = Object.values(registered);
  const onCount = list.filter((m) => enabled[m.id]).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        Indicators{onCount > 0 ? ` (${onCount})` : ''}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-30 w-64 rounded border border-slate-700 bg-slate-900 p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">Indicators</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
        </div>
      )}
    </div>
  );
}
