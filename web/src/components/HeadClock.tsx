'use client';

import { useReplayStore } from '@/store/replayStore';

/**
 * Read-out of the current replay head. Works anywhere — the Zustand store is a
 * global singleton, so this does not need to sit inside ReplayProvider.
 */
export function HeadClock() {
  const ts = useReplayStore((s) => s.currentTimestamp);
  const label = ts
    ? new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : '—';
  return (
    <span data-testid="head-clock" className="font-mono text-sm tabular-nums text-slate-300">
      {label}
    </span>
  );
}
