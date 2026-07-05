'use client';

import { useEffect, useRef } from 'react';
import { Play, Pause, StepForward, StepBack } from 'lucide-react';
import { useReplayStore } from '@/store/replayStore';
import { useChartStore } from '@/store/chartStore';
import { useActiveTab } from '@/store/workspaceStore';
import { TIMEFRAME_MINUTES } from '@/lib/visibleData';
import { getRange } from '@/lib/candleSource';
import { useInterval } from '@/hooks/useInterval';
import { registerHotkey } from '@/lib/hotkeys';
import { Tooltip } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { TimezoneSelect } from '@/components/TimezoneSelect';

/**
 * Playback transport: step back / play-pause / step forward + a candle-speed
 * selector. Steps move ±1 BAR of the focused pane's timeframe (Shift = ±10),
 * TradingView-style. Owns the replay clock (one per app) and the transport
 * hotkeys: Space, ←/→, Shift+←/→, Home/End.
 */

// One real-time tick per second; the dropdown controls market-time per tick.
const TICK_MS = 1000;

// Gap-skip: while playing, if there's no real m1 data within GAP_SKIP_MS ahead of
// the head, it's sitting in a market-closed stretch (weekend/holiday) — jump to
// the next actual bar. 30 min is well above the 1-min bar cadence, so normal
// data (and brief low-liquidity minutes) is never skipped. Look up to a week
// ahead to clear even long holiday closures.
const GAP_SKIP_MS = 30 * 60_000;
const GAP_LOOKAHEAD_MS = 7 * 24 * 60 * 60_000;

// stepSize = market time advanced per real second while playing.
const STEP_OPTIONS = [
  { label: '1s', ms: 1_000 },
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '15m', ms: 900_000 },
  { label: '1h', ms: 3_600_000 },
  { label: '4h', ms: 14_400_000 }
];

export function PlaybackBar() {
  const isPlaying = useReplayStore((s) => s.isPlaying);
  const stepSize = useReplayStore((s) => s.stepSize);
  const togglePlay = useReplayStore((s) => s.togglePlay);
  const stepForward = useReplayStore((s) => s.stepForward);
  const setStepSize = useReplayStore((s) => s.setStepSize);

  const activePaneId = useChartStore((s) => s.activePaneId);
  const tab = useActiveTab();
  const activeTf = tab?.layout.panes.find((p) => p.id === activePaneId)?.timeframe ?? tab?.layout.panes[0]?.timeframe ?? 'm1';

  // Drive the replay head while playing; `null` delay pauses the interval.
  useInterval(stepForward, isPlaying ? TICK_MS : null);

  // Skip market-closed gaps while playing: if no real m1 bar sits within the
  // next GAP_SKIP_MS, jump the head straight to the next actual candle so
  // playback doesn't crawl through empty weekends/holidays.
  const symbol = useReplayStore((s) => s.symbol);
  const head = useReplayStore((s) => s.currentTimestamp);
  const bounds = useReplayStore((s) => s.bounds);
  useEffect(() => {
    if (!isPlaying || !symbol || !head || !bounds) return;
    let cancelled = false;
    (async () => {
      // Fast path: any data close ahead means we're not in a gap.
      const near = await getRange(symbol, 'm1', head, Math.min(bounds.max, head + GAP_SKIP_MS));
      if (cancelled || near.length) return;
      // In a gap — find the next real bar and jump to it.
      const far = await getRange(symbol, 'm1', head, Math.min(bounds.max, head + GAP_LOOKAHEAD_MS));
      if (!cancelled && far.length && far[0].timestamp > head) {
        useReplayStore.getState().setTimestamp(far[0].timestamp);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPlaying, symbol, head, bounds]);

  // Manual steps move by BARS of the focused pane's timeframe (ref updated in
  // an effect so the stable hotkey handlers always see the current TF).
  const barMsRef = useRef(60_000);
  useEffect(() => {
    barMsRef.current = TIMEFRAME_MINUTES[activeTf] * 60_000;
  }, [activeTf]);
  const step = (n: number) => useReplayStore.getState().stepBars(n, barMsRef.current);

  useEffect(() => {
    const unsubs = [
      registerHotkey('space', 'Play / pause', 'Replay', () => useReplayStore.getState().togglePlay()),
      registerHotkey('arrowright', 'Step forward 1 bar', 'Replay', () => step(1)),
      registerHotkey('arrowleft', 'Step back 1 bar', 'Replay', () => step(-1)),
      registerHotkey('shift+arrowright', 'Step forward 10 bars', 'Replay', () => step(10)),
      registerHotkey('shift+arrowleft', 'Step back 10 bars', 'Replay', () => step(-10)),
      registerHotkey('home', 'Jump to session start', 'Replay', () => {
        const s = useReplayStore.getState();
        if (s.bounds) s.setTimestamp(s.bounds.min);
      }),
      registerHotkey('end', 'Jump to session end', 'Replay', () => {
        const s = useReplayStore.getState();
        if (s.bounds) s.setTimestamp(s.bounds.max);
      })
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return (
    <div className="flex w-fit items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 shadow-lg">
      <Tooltip
        label={
          <span className="flex items-center gap-1.5">
            Step back 1 {activeTf.toUpperCase()} bar <Kbd>←</Kbd> ·10 <Kbd>Shift + ←</Kbd>
          </span>
        }
      >
        <button
          type="button"
          onClick={(e) => step(e.shiftKey ? -10 : -1)}
          aria-label="Step back"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 transition hover:bg-slate-700 active:scale-95"
        >
          <StepBack className="h-4 w-4" />
        </button>
      </Tooltip>

      <Tooltip label={<span className="flex items-center gap-1.5">Play / pause <Kbd>Space</Kbd></span>}>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 transition hover:bg-blue-500 active:scale-95"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </Tooltip>

      <Tooltip
        label={
          <span className="flex items-center gap-1.5">
            Step forward 1 {activeTf.toUpperCase()} bar <Kbd>→</Kbd> ·10 <Kbd>Shift + →</Kbd>
          </span>
        }
      >
        <button
          type="button"
          onClick={(e) => step(e.shiftKey ? 10 : 1)}
          aria-label="Step forward"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 transition hover:bg-slate-700 active:scale-95"
        >
          <StepForward className="h-4 w-4" />
        </button>
      </Tooltip>

      <label className="ml-1 flex items-center gap-1 text-xs text-slate-400">
        Candle speed
        <select
          aria-label="Candle speed (market time per real second while playing)"
          title="Market time formed per real second while playing"
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

      <label className="flex items-center gap-1 text-xs text-slate-400">
        TZ
        <TimezoneSelect />
      </label>
    </div>
  );
}
