'use client';

import { useReplayStore } from '@/store/replayStore';
import { useSettingsStore } from '@/store/settingsStore';
import { formatDateTime, zoneLabel } from '@/lib/timezone';

/**
 * Read-out of the current replay head, shown in the user's display timezone.
 * Works anywhere — the Zustand store is a global singleton.
 */
export function HeadClock() {
  const ts = useReplayStore((s) => s.currentTimestamp);
  const tz = useSettingsStore((s) => s.timezone);
  const label = ts ? `${formatDateTime(ts, tz)} ${zoneLabel(tz)}` : '—';
  return (
    <span data-testid="head-clock" className="font-mono text-sm tabular-nums text-slate-300">
      {label}
    </span>
  );
}
