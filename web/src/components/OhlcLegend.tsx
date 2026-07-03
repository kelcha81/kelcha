'use client';

import { useEffect, useState } from 'react';
import { ActionType, type KLineData } from 'klinecharts';
import { useChartStore } from '@/store/chartStore';
import { useReplayStore } from '@/store/replayStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * TradingView-style OHLC legend, top-left of a pane: symbol · TF · O H L C ·
 * Δ/Δ%. Tracks the crosshair bar; falls back to the latest (replay-head) bar.
 * Reads the bar under the crosshair via the chart's onCrosshairChange action.
 */
export function OhlcLegend({
  paneId,
  symbol,
  timeframe,
  pricePrecision
}: {
  paneId: string;
  symbol: string;
  timeframe: string;
  pricePrecision: number;
}) {
  const chart = useChartStore((s) => s.charts[paneId]?.chart ?? null);
  const head = useReplayStore((s) => s.currentTimestamp); // re-render per tick
  const theme = useSettingsStore((s) => s.theme);
  const [hover, setHover] = useState<KLineData | null>(null);

  useEffect(() => {
    if (!chart) return;
    const onCrosshair = (data: unknown) => {
      const d = data as { kLineData?: KLineData } | undefined;
      setHover(d?.kLineData ?? null);
    };
    chart.subscribeAction(ActionType.OnCrosshairChange, onCrosshair);
    return () => chart.unsubscribeAction(ActionType.OnCrosshairChange, onCrosshair);
  }, [chart]);

  // Latest bar under the head (getDataList is already replay-windowed).
  void head;
  const list = chart?.getDataList() ?? [];
  const last = list.length ? list[list.length - 1] : null;
  const bar = hover ?? last;
  if (!bar) return null;

  // Δ vs previous close (crosshair bar → its predecessor; live bar → prior bar).
  const idx = hover ? list.findIndex((b) => b.timestamp === hover.timestamp) : list.length - 1;
  const prevClose = idx > 0 ? list[idx - 1].close : bar.open;
  const delta = bar.close - prevClose;
  const pct = prevClose !== 0 ? (delta / prevClose) * 100 : 0;
  const up = delta >= 0;
  const col = up ? theme.up : theme.down;
  const f = (n: number) => n.toFixed(pricePrecision);

  return (
    <div className="pointer-events-none absolute left-2 top-1.5 z-10 flex items-center gap-2 font-mono text-[11px] tabular-nums">
      <span className="font-sans font-semibold" style={{ color: theme.text }}>
        {symbol.toUpperCase()} <span className="font-normal opacity-70">{timeframe.toUpperCase()}</span>
      </span>
      <span style={{ color: col }}>
        O {f(bar.open)} H {f(bar.high)} L {f(bar.low)} C {f(bar.close)}
      </span>
      <span style={{ color: col }}>
        {up ? '+' : ''}
        {f(delta)} ({up ? '+' : ''}
        {pct.toFixed(2)}%)
      </span>
    </div>
  );
}
