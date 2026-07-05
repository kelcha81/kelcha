'use client';

import { useSettingsStore } from '@/store/settingsStore';
import { DISPLAY_ZONES, zoneLabel } from '@/lib/timezone';

/** Global display-timezone picker: shifts the chart x-axis + head clock + scrubber. */
export function TimezoneSelect() {
  const tz = useSettingsStore((s) => s.timezone);
  const setTimezone = useSettingsStore((s) => s.setTimezone);
  return (
    <select
      value={tz}
      onChange={(e) => setTimezone(e.target.value)}
      title="Display timezone"
      aria-label="Display timezone"
      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {DISPLAY_ZONES.map((z) => (
        <option key={z} value={z}>
          {zoneLabel(z)}
        </option>
      ))}
    </select>
  );
}
