'use client';

import { X } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { useIctStore, type IctConfig } from '@/store/ictStore';

const TIMEZONES = [
  'America/New_York',
  'GMT+0',
  'GMT+1',
  'GMT+2',
  'GMT+3',
  'GMT-4',
  'GMT-5',
  'GMT-6',
  'GMT-8',
  'GMT+8',
  'GMT+9',
  'GMT+10'
];

const TOGGLES: { key: keyof IctConfig; label: string }[] = [
  { key: 'showBoxes', label: 'Boxes' },
  { key: 'showText', label: 'Box text' },
  { key: 'showPivots', label: 'Pivots' },
  { key: 'showLabels', label: 'Pivot labels' }
];

export function ICTSettings({ onClose }: { onClose: () => void }) {
  const cfg = useIctStore();
  const setConfig = useIctStore((s) => s.setConfig);
  const setKillzone = useIctStore((s) => s.setKillzone);

  return (
    <Modal onClose={onClose} ariaLabel="ICT Killzones settings" className="w-[460px]">
      <div className="flex items-center justify-between border-b border-slate-800 p-3">
        <span className="text-sm font-semibold">ICT Killzones — Settings</span>
        <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-slate-200">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">
            Timezone
            <select
              value={cfg.timezone}
              onChange={(e) => setConfig({ timezone: e.target.value })}
              className="ml-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-slate-100"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="ml-auto text-xs text-slate-400">
            Sessions kept
            <input
              type="number"
              min={1}
              value={cfg.maxSessions}
              onChange={(e) => setConfig({ maxSessions: Math.max(1, Number(e.target.value)) })}
              className="ml-1 w-14 rounded border border-slate-700 bg-slate-800 px-1 py-1 text-right text-xs text-slate-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(cfg[t.key])}
                onChange={(e) => setConfig({ [t.key]: e.target.checked })}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              {t.label}
            </label>
          ))}
        </div>

        <div className="space-y-1 border-t border-slate-800 pt-2">
          <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 text-[10px] uppercase text-slate-500">
            <span>On</span>
            <span>Label</span>
            <span>Session</span>
            <span>Colour</span>
          </div>
          {cfg.killzones.map((kz) => (
            <div key={kz.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
              <input
                type="checkbox"
                checked={kz.enabled}
                onChange={(e) => setKillzone(kz.id, { enabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              <input
                type="text"
                value={kz.label}
                onChange={(e) => setKillzone(kz.id, { label: e.target.value })}
                className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-slate-100"
              />
              <input
                type="text"
                value={kz.session}
                onChange={(e) => setKillzone(kz.id, { session: e.target.value })}
                placeholder="HHMM-HHMM"
                className="w-24 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-slate-100"
              />
              <input
                type="color"
                value={kz.color}
                onChange={(e) => setKillzone(kz.id, { color: e.target.value })}
                className="h-6 w-8 cursor-pointer rounded border border-slate-700 bg-transparent p-0"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          Times are in the selected timezone, 24h (e.g. 0930-1100). Use 0000 as midnight-end.
        </p>
      </div>
    </Modal>
  );
}
