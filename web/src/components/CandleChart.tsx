'use client';

import { useEffect, useRef } from 'react';
import { init, dispose, type Chart, type KLineData } from 'klinecharts';
import type { Candle, Timeframe } from '@/store/replayStore';
import { useReplayStore } from '@/store/replayStore';
import { useActiveTab } from '@/store/workspaceStore';
import { getSymbolInfo } from '@/lib/symbols';
import { useChartStore } from '@/store/chartStore';
import { useOrderToolStore } from '@/store/orderToolStore';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useSettingsStore, type ChartTheme } from '@/store/settingsStore';
import { getCanvasFont } from '@/lib/fonts';
import { restoreOverlays } from '@/lib/overlays';
import { useVisibleData } from '@/hooks/useVisibleData';

/** KLineChart consumes our candle shape directly (timestamp in ms). */
function toKline(c: Candle): KLineData {
  return {
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume
  };
}

function buildStyles(t: ChartTheme) {
  const font = getCanvasFont();
  return {
    grid: { horizontal: { color: t.grid }, vertical: { color: t.grid } },
    candle: {
      bar: {
        upColor: t.up,
        downColor: t.down,
        // Borders are separately themable; unset = follow the body colour.
        upBorderColor: t.upBorder ?? t.up,
        downBorderColor: t.downBorder ?? t.down,
        upWickColor: t.up,
        downWickColor: t.down
      },
      priceMark: { last: { text: { color: '#ffffff', family: font } } },
      tooltip: { text: { family: font } }
    },
    xAxis: {
      axisLine: { color: t.axis },
      tickLine: { color: t.axis },
      tickText: { color: t.text, family: font }
    },
    yAxis: {
      axisLine: { color: t.axis },
      tickLine: { color: t.axis },
      tickText: { color: t.text, family: font }
    },
    crosshair: {
      horizontal: { line: { color: t.text }, text: { backgroundColor: t.axis, family: font } },
      vertical: { line: { color: t.text }, text: { backgroundColor: t.axis, family: font } }
    },
    separator: { color: t.axis }
  };
}

/**
 * Candlestick chart for one timeframe, driven by the replay engine (KLineChart v9).
 * Registers its instance in the chart store so the toolbar, drawing rail, and
 * plugin bridge can act on it.
 */
export function CandleChart({
  tabId,
  paneId,
  timeframe
}: {
  tabId: string;
  paneId: string;
  timeframe: Timeframe;
}) {
  const { symbol } = useActiveTab();
  const { pricePrecision } = getSymbolInfo(symbol);
  const theme = useSettingsStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const prevLenRef = useRef(0);
  const prevFirstTimeRef = useRef<number | null>(null);

  const candles = useVisibleData(timeframe);

  // Create the chart once (and on precision change).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el);
    chart?.setStyles(buildStyles(useSettingsStore.getState().theme));
    chart?.setPriceVolumePrecision(pricePrecision, 0);

    chartRef.current = chart;
    prevLenRef.current = 0;
    prevFirstTimeRef.current = null;
    if (chart) {
      useChartStore.getState().registerChart(paneId, chart, el);
      restoreOverlays(chart, `${tabId}:${paneId}`);
    }

    // Resize the chart when its pane changes size (window resize OR layout change).
    const ro = new ResizeObserver(() => chart?.resize());
    ro.observe(el);

    // Click-to-seek: map the click position to a candle timestamp and move the
    // replay head there. Skipped while a drawing tool is active so it doesn't
    // hijack the clicks used to draw.
    const onSeekClick = (ev: MouseEvent) => {
      useChartStore.getState().setActivePane(paneId);
      const rect = el.getBoundingClientRect();
      const res = chart?.convertFromPixel(
        [{ x: ev.clientX - rect.left, y: ev.clientY - rect.top }],
        { paneId: 'candle_pane' }
      );
      const point = Array.isArray(res) ? res[0] : res;

      // Order composer: if a level pick is armed, set it from the clicked price.
      const tool = useOrderToolStore.getState();
      if (tool.pick) {
        if (typeof point?.value === 'number') {
          tool.setValue(tool.pick, point.value);
          tool.setPick(null);
        }
        return;
      }

      // Drawing tool active -> let it handle the click (no seek).
      if (useChartStore.getState().activeTool) return;

      const ts = point?.timestamp;
      if (typeof ts === 'number') useReplayStore.getState().setTimestamp(ts);
    };
    el.addEventListener('click', onSeekClick);

    // Right-click → context menu for the currently-selected overlay. KLineChart's
    // own onRightClick only fires when you hit an overlay's thin line exactly, so
    // this DOM handler (select the overlay, then right-click anywhere) is reliable.
    const onContextMenu = (ev: MouseEvent) => {
      const sel = useOverlayMenuStore.getState().selected;
      if (!sel) return;
      const ov = sel.chart.getOverlayById(sel.id);
      if (!ov) return;
      ev.preventDefault();
      useOverlayMenuStore.getState().openMenu({ chart: sel.chart, overlay: ov, paneKey: sel.paneKey });
    };
    el.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      ro.disconnect();
      el.removeEventListener('click', onSeekClick);
      el.removeEventListener('contextmenu', onContextMenu, true);
      useChartStore.getState().unregisterChart(paneId);
      dispose(el);
      chartRef.current = null;
    };
  }, [pricePrecision, paneId, tabId]);

  // Re-apply chart styles when the theme changes (no remount).
  useEffect(() => {
    chartRef.current?.setStyles(buildStyles(theme));
  }, [theme]);

  // Sync data on every tick / data change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (candles.length === 0) {
      chart.applyNewData([]);
      prevLenRef.current = 0;
      prevFirstTimeRef.current = null;
      return;
    }

    const len = candles.length;
    const firstTime = candles[0].timestamp;
    const prevLen = prevLenRef.current;
    const grewByOne = len === prevLen + 1 && prevFirstTimeRef.current === firstTime;
    const formingMoved = len === prevLen && prevFirstTimeRef.current === firstTime;

    if (formingMoved) {
      chart.updateData(toKline(candles[len - 1]));
    } else if (grewByOne) {
      chart.updateData(toKline(candles[len - 2]));
      chart.updateData(toKline(candles[len - 1]));
    } else {
      chart.applyNewData(candles.map(toKline));
    }

    prevLenRef.current = len;
    prevFirstTimeRef.current = firstTime;
  }, [candles]);

  return <div ref={containerRef} className="relative h-full w-full" style={{ background: theme.background }} />;
}
