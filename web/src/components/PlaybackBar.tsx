'use client';

import { Play, Pause, StepForward, StepBack } from 'lucide-react';
import { useReplayStore } from '@/store/replayStore';
import { useInterval } from '@/hooks/useInterval';

/**
 * Playback transport: step back / play-pause / step forward + a speed selector.
 *
 * Owns the replay clock: while playing, `useInterval` advances the head once per
 * TICK_MS. The selector sets `stepSize` = how much MARKET time each tick advances,
 * so the labels are real durations (1s … 1h per second) — i.e. how fast candles
 * form. Mount exactly one PlaybackBar.
 */

// One real-time tick per second; the dropdown controls market-time per tick.
const TICK_MS = 1000;

// stepSize = market time advanced per real second.
const STEP_OPTIONS = [
  { label: '1s', ms: 1_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '15m', ms: 900_000 },
  { label: '1h', ms: 3_600_000 }
];

export function PlaybackBar() {
  const isPlaying = useReplayStore((s) => s.isPlaying);
  const stepSize = useReplayStore((s) => s.stepSize);

  const togglePlay = useReplayStore((s) => s.togglePlay);
  const stepForward = useReplayStore((s) => s.stepForward);
  const stepBackward = useReplayStore((s) => s.stepBackward);
  const setStepSize = useReplayStore((s) => s.setStepSize);

  // Drive the replay head while playing; `null` delay pauses the interval.
  useInterval(stepForward, isPlaying ? TICK_MS : null);

  return (
    <div className="flex w-fit items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 shadow-lg">
      <button
        type="button"
        onClick={stepBackward}
        aria-label="Step back"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 transition hover:bg-slate-700 active:scale-95"
      >
        <StepBack className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        aria-pressed={isPlaying}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 transition hover:bg-blue-500 active:scale-95"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={stepForward}
        aria-label="Step forward"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 transition hover:bg-slate-700 active:scale-95"
      >
        <StepForward className="h-4 w-4" />
      </button>

      <label className="ml-1 flex items-center gap-1 text-xs text-slate-400">
        Speed
        <select
          aria-label="Speed (market time per second)"
          value={stepSize}
          onChange={(e) => setStepSize(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STEP_OPTIONS.map((o) => (
            <option key={o.ms} value={o.ms}>
              {o.label}/s
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
