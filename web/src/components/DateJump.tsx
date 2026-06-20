'use client';

import { Shuffle } from 'lucide-react';
import { useReplayStore } from '@/store/replayStore';

const toDateInput = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/**
 * FXReplay-style start selection: jump the replay head to a specific date, or a
 * random date within the data range (the chart hides everything after the head,
 * so you replay forward from there).
 */
export function DateJump() {
  const head = useReplayStore((s) => s.currentTimestamp);
  const bounds = useReplayStore((s) => s.bounds);
  const setTimestamp = useReplayStore((s) => s.setTimestamp);

  if (!bounds || !head) return null;

  const jumpToDate = (value: string) => {
    if (!value) return;
    const ts = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isNaN(ts)) setTimestamp(ts);
  };

  const randomStart = () => {
    setTimestamp(bounds.min + Math.random() * (bounds.max - bounds.min));
  };

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="hidden sm:inline">Start</span>
      <input
        type="date"
        value={toDateInput(head)}
        min={toDateInput(bounds.min)}
        max={toDateInput(bounds.max)}
        onChange={(e) => jumpToDate(e.target.value)}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 [color-scheme:dark]"
      />
      <button
        type="button"
        onClick={randomStart}
        title="Random start date"
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
      >
        <Shuffle className="h-3.5 w-3.5" />
        Random
      </button>
    </div>
  );
}
