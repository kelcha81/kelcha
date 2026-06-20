'use client';

import { useRef, useState } from 'react';
import { Palette, X } from 'lucide-react';
import { useSettingsStore, PRESETS, type ChartTheme } from '@/store/settingsStore';
import { useClickOutside } from '@/hooks/useClickOutside';

const SWATCHES: { key: keyof ChartTheme; label: string }[] = [
  { key: 'up', label: 'Up' },
  { key: 'down', label: 'Down' },
  { key: 'background', label: 'Background' },
  { key: 'grid', label: 'Grid' },
  { key: 'text', label: 'Text' },
  { key: 'axis', label: 'Axis' }
];

export function ThemeMenu() {
  const theme = useSettingsStore((s) => s.theme);
  const preset = useSettingsStore((s) => s.preset);
  const customThemes = useSettingsStore((s) => s.customThemes);
  const applyPreset = useSettingsStore((s) => s.applyPreset);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const saveTheme = useSettingsStore((s) => s.saveTheme);
  const deleteTheme = useSettingsStore((s) => s.deleteTheme);
  const resetTheme = useSettingsStore((s) => s.resetTheme);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const customNames = Object.keys(customThemes);
  const dirty = preset === 'Custom'; // edited but unsaved

  const save = () => {
    const n = name.trim();
    if (!n) return;
    saveTheme(n);
    setName('');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Theme"
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        <Palette className="h-3.5 w-3.5" />
        {preset}
        {dirty && <span className="text-amber-400">•</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-30 w-60 rounded border border-slate-700 bg-slate-900 p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200">Theme</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-1 text-[11px] uppercase text-slate-500">Themes</div>
          <div className="mb-3 flex flex-wrap gap-1">
            {Object.keys(PRESETS).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => applyPreset(n)}
                className={`rounded px-2 py-1 text-xs ${
                  preset === n ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {n}
              </button>
            ))}
            {customNames.map((n) => (
              <span
                key={n}
                className={`group flex items-center gap-1 rounded px-2 py-1 text-xs ${
                  preset === n ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <button type="button" onClick={() => applyPreset(n)}>
                  {n}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${n}`}
                  onClick={() => deleteTheme(n)}
                  className="opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="mb-1 text-[11px] uppercase text-slate-500">Colours</div>
          <div className="grid grid-cols-2 gap-1.5">
            {SWATCHES.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                {label}
                <input
                  type="color"
                  value={theme[key]}
                  onChange={(e) => setTheme({ [key]: e.target.value })}
                  className="h-6 w-8 cursor-pointer rounded border border-slate-700 bg-transparent"
                />
              </label>
            ))}
          </div>

          {/* Save appears once colours have been edited (preset = Custom). */}
          {dirty && (
            <div className="mt-3 flex gap-1">
              <input
                type="text"
                value={name}
                placeholder="New theme name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100"
              />
              <button
                type="button"
                onClick={save}
                disabled={!name.trim()}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={resetTheme}
            className="mt-2 w-full rounded border border-slate-700 bg-slate-800 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            Reset to Dark
          </button>
        </div>
      )}
    </div>
  );
}
