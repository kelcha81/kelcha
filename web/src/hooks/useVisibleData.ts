import { useCallback, useEffect, useRef, useState } from 'react';
import { useReplayStore } from '@/store/replayStore';
import type { Candle, FullData, Timeframe } from '@/store/replayStore';
import { buildVisibleData, TIMEFRAME_MINUTES } from '@/lib/visibleData';
import { getRange } from '@/lib/candleSource';

// Bars kept loaded around the head. The display window (closed bars) reloads only
// near its edges; the forming bar's M1 covers just the current period and reloads
// only when the head crosses into a new bar — so even monthly stays cheap.
const DISPLAY_BARS = 600;
const FORWARD_BARS = 400;
const MARGIN_BARS = 120;
// Each loadOlder() pulls another page of history further back. Older closed bars
// are immutable and cached, so extending is mostly free.
const HISTORY_PAGE_BARS = 750;

interface LoadedWindow {
  symbol: string;
  timeframe: Timeframe;
  loadedFrom: number; // oldest ts actually fetched (history-extent coverage)
  safeFrom: number; // reload display once head drops below this
  safeTo: number; // reload display once head rises above this
  periodStart: number; // current (forming) bar start
  periodEnd: number; // next bar start — reload M1 once head reaches it
  data: FullData; // { [tf]: closed window, m1: current period's M1 }
}

export interface VisibleData {
  candles: Candle[];
  /** Extend the loaded history one page further back (for scroll-to-left-edge). */
  loadOlder: () => void;
  /** True while there is still older history left of what's loaded. */
  hasMore: boolean;
}

/**
 * Candles a chart should render for `timeframe`: closed bars up to the replay
 * head plus the live forming bar, read in a sliding window from the CandleSource.
 * Memory stays bounded during normal playback; scrolling/zooming to the left edge
 * calls `loadOlder()` to widen the history extent on demand (TradingView-style),
 * so a short session can still reveal the full chart history behind it.
 */
export function useVisibleData(timeframe: Timeframe): VisibleData {
  const symbol = useReplayStore((s) => s.symbol);
  const head = useReplayStore((s) => s.currentTimestamp);
  const dataBounds = useReplayStore((s) => s.dataBounds);

  const [visible, setVisible] = useState<Candle[]>([]);
  const windowRef = useRef<LoadedWindow | null>(null);
  const reqRef = useRef(0);
  // Oldest ts the user has scrolled back to want loaded (null = default window).
  const backTargetRef = useRef<number | null>(null);
  const [historyNonce, setHistoryNonce] = useState(0);

  // Reset the history extent whenever the series identity changes.
  useEffect(() => {
    backTargetRef.current = null;
  }, [symbol, timeframe]);

  const loadOlder = useCallback(() => {
    const w = windowRef.current;
    if (!w || !dataBounds) return;
    if (w.loadedFrom <= dataBounds.min) return; // already at the start of history
    const tfMs = TIMEFRAME_MINUTES[timeframe] * 60_000;
    backTargetRef.current = Math.max(dataBounds.min, w.loadedFrom - HISTORY_PAGE_BARS * tfMs);
    setHistoryNonce((n) => n + 1);
  }, [timeframe, dataBounds]);

  useEffect(() => {
    if (!symbol || !dataBounds || !head) {
      windowRef.current = null;
      setVisible([]);
      return;
    }

    const tfMs = TIMEFRAME_MINUTES[timeframe] * 60_000;
    // Default back edge follows the head; a scrolled-back target pins it older.
    const headFrom = head - DISPLAY_BARS * tfMs;
    const desiredFrom = Math.max(
      dataBounds.min,
      Math.min(headFrom, backTargetRef.current ?? headFrom)
    );

    const w = windowRef.current;
    const covered =
      !!w &&
      w.symbol === symbol &&
      w.timeframe === timeframe &&
      head >= w.safeFrom &&
      head <= w.safeTo &&
      head >= w.periodStart &&
      head < w.periodEnd &&
      w.loadedFrom <= desiredFrom; // already loaded at least as far back as wanted

    if (covered) {
      setVisible(buildVisibleData(w.data, head, timeframe));
      return;
    }

    const req = ++reqRef.current;
    let cancelled = false;

    (async () => {
      const from = desiredFrom;
      const to = Math.min(dataBounds.max, head + FORWARD_BARS * tfMs);

      const tfWindow = await getRange(symbol, timeframe, from, to);
      if (cancelled || req !== reqRef.current) return;

      const data: FullData = {};
      data[timeframe] = tfWindow;

      // For non-M1 timeframes the forming bar is rebuilt from the current period's
      // M1 only. Find that period in the window and load just its M1 (bounded).
      let periodStart = -Infinity;
      let periodEnd = Infinity;
      if (timeframe !== 'm1') {
        // Two-phase paint: closed bars render the moment the tf window arrives
        // (forming bar is null until its m1 chunk lands — matters on a cold
        // cache, where the m1 month fetch is the slow part).
        setVisible(buildVisibleData(data, head, timeframe));

        let pIdx = -1;
        for (let i = tfWindow.length - 1; i >= 0; i--) {
          if (tfWindow[i].timestamp <= head) {
            pIdx = i;
            break;
          }
        }
        periodStart = pIdx >= 0 ? tfWindow[pIdx].timestamp : from;
        periodEnd =
          pIdx >= 0 && pIdx + 1 < tfWindow.length ? tfWindow[pIdx + 1].timestamp : dataBounds.max + 1;

        const m1Window = await getRange(symbol, 'm1', periodStart, periodEnd);
        if (cancelled || req !== reqRef.current) return;
        data.m1 = m1Window;
      }

      // windowRef only set once BOTH pieces are in, keeping the covered
      // fast-path (which assumes a complete window) intact.
      windowRef.current = {
        symbol,
        timeframe,
        loadedFrom: from,
        safeFrom: from <= dataBounds.min ? -Infinity : from + MARGIN_BARS * tfMs,
        safeTo: to >= dataBounds.max ? Infinity : to - MARGIN_BARS * tfMs,
        periodStart,
        periodEnd,
        data
      };
      setVisible(buildVisibleData(data, head, timeframe));
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, head, timeframe, dataBounds, historyNonce]);

  // Older history remains as long as the oldest loaded bar isn't the data start.
  const hasMore = visible.length > 0 && !!dataBounds && visible[0].timestamp > dataBounds.min;
  return { candles: visible, loadOlder, hasMore };
}
