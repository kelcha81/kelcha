import { create } from 'zustand';

/**
 * Replay Engine store.
 *
 * Why Zustand: components subscribe to slices of this state via selectors
 * (e.g. `useReplayStore((s) => s.isPlaying)`), so a play/pause toggle re-renders
 * only the transport controls — not the charts. Keep reads selector-scoped.
 *
 * Data is NOT held here. The store knows the active `symbol` and its `bounds`;
 * candles are read on demand in windows via the CandleSource (`useVisibleData`).
 * This keeps memory bounded regardless of how much history exists.
 */

// ---- Domain types -----------------------------------------------------------

export interface Candle {
  timestamp: number; // Unix milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = 'm1' | 'm5' | 'm15' | 'h1' | 'h4' | 'd1' | 'w1' | 'mo1';

/** A (partial) map of candle arrays per timeframe — used as the *window* shape
 *  fed to the visible-data builder (only the timeframes in play are present). */
export type FullData = Partial<Record<Timeframe, Candle[]>>;

/** Available time span of the active symbol's data (Unix ms). */
export interface Bounds {
  min: number;
  max: number;
}

// ---- Store shape ------------------------------------------------------------

export interface ReplayState {
  // Session
  symbol: string | null;
  bounds: Bounds | null; // head clamp = the session's [start, end]
  dataBounds: Bounds | null; // full data range (the chart can show pre-start history)

  // Replay head + transport
  currentTimestamp: number; // Unix ms of the replay head
  isPlaying: boolean;
  playbackSpeed: number; // ms delay between ticks
  stepSize: number; // ms jumped per tick

  // Actions
  setSession: (
    symbol: string,
    dataBounds: Bounds,
    opts?: { start?: number; end?: number; startTs?: number }
  ) => void;
  setTimestamp: (timestamp: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  /** Step by N bars of the given bar duration (the focused pane's timeframe). */
  stepBars: (n: number, barMs: number) => void;
  togglePlay: () => void;
  setPlaybackSpeed: (ms: number) => void;
  setStepSize: (ms: number) => void;
}

/** Clamp the head to the active symbol's data bounds. No-op until bounds set. */
function clamp(ts: number, bounds: Bounds | null): number {
  if (!bounds) return ts;
  return Math.min(Math.max(ts, bounds.min), bounds.max);
}

export const useReplayStore = create<ReplayState>((set) => ({
  // ---- Initial state ----
  symbol: null,
  bounds: null,
  dataBounds: null,
  currentTimestamp: 0,
  isPlaying: false,
  playbackSpeed: 1000, // 1 tick/sec by default
  stepSize: 60_000, // 1 minute

  // ---- Actions ----

  /** Start a session: `dataBounds` is the symbol's full range; `opts.start/end`
   *  define the session window the head is clamped to (default: full). The head
   *  parks at `startTs` (default: session start). */
  setSession: (symbol, dataBounds, opts) =>
    set(() => {
      let min = Math.max(dataBounds.min, opts?.start ?? dataBounds.min);
      let max = Math.min(dataBounds.max, opts?.end ?? dataBounds.max);
      // If the requested window doesn't overlap the downloaded data, the head
      // would be pinned (min >= max) and playback couldn't advance — fall back
      // to the full data range so there's always room to play.
      if (min >= max) {
        min = dataBounds.min;
        max = dataBounds.max;
      }
      const bounds = { min, max };
      return {
        symbol,
        dataBounds,
        bounds,
        currentTimestamp: clamp(opts?.startTs ?? min, bounds),
        isPlaying: false
      };
    }),

  /** Jump the replay head to an explicit timestamp (clamped to bounds). */
  setTimestamp: (timestamp) => set((s) => ({ currentTimestamp: clamp(timestamp, s.bounds) })),

  /** Advance one tick (stepSize ms). Auto-pauses at the end of the data. */
  stepForward: () =>
    set((s) => {
      const next = clamp(s.currentTimestamp + s.stepSize, s.bounds);
      const atEnd = s.bounds != null && next === s.bounds.max;
      return { currentTimestamp: next, isPlaying: atEnd ? false : s.isPlaying };
    }),

  /** Rewind one tick (stepSize ms), clamped to the start of the data. */
  stepBackward: () => set((s) => ({ currentTimestamp: clamp(s.currentTimestamp - s.stepSize, s.bounds) })),

  /** Step ±N bars of the focused pane's timeframe (TradingView-style arrows).
   *  Auto-pauses when a forward step lands on the session end. */
  stepBars: (n, barMs) =>
    set((s) => {
      const next = clamp(s.currentTimestamp + n * barMs, s.bounds);
      const atEnd = s.bounds != null && next === s.bounds.max;
      return { currentTimestamp: next, isPlaying: atEnd && n > 0 ? false : s.isPlaying };
    }),

  /** Flip play/pause. The interval driver lives in <PlaybackBar/>. */
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  /** Set the delay between ticks (ms). Larger = slower playback. */
  setPlaybackSpeed: (ms) => set({ playbackSpeed: Math.max(0, ms) }),

  /** Set how much market time each tick advances (ms). */
  setStepSize: (ms) => set({ stepSize: Math.max(1, ms) })
}));

/* ---------------------------------------------------------------------------
 * Driving the play loop (kept out of the store on purpose)
 *
 * `togglePlay` only flips the flag. The single ticking source is <PlaybackBar/>,
 * which uses `useInterval` to call `stepForward` every `playbackSpeed` ms while
 * `isPlaying`. Keep exactly one clock mounted.
 * ------------------------------------------------------------------------- */
