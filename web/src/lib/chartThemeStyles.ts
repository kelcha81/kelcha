import { TooltipShowRule } from 'klinecharts';
import { getCanvasFont } from '@/lib/fonts';
import type { ChartTheme } from '@/store/settingsStore';

/**
 * Shared KLineChart v9 style builder driven by the global `useSettingsStore` theme.
 * Used identically across Manual Replay, Live Radar/Forecast Boards, and the Backtest Visual Hub.
 */
export function buildKlineChartStyles(t: ChartTheme) {
  const font = getCanvasFont();
  return {
    grid: {
      horizontal: { color: t.grid },
      vertical: { color: t.grid },
    },
    candle: {
      bar: {
        upColor: t.up,
        downColor: t.down,
        upBorderColor: t.upBorder ?? t.up,
        downBorderColor: t.downBorder ?? t.down,
        upWickColor: t.up,
        downWickColor: t.down,
      },
      priceMark: {
        last: {
          text: { color: '#ffffff', family: font },
        },
      },
      tooltip: {
        showRule: TooltipShowRule.FollowCross,
        text: { color: t.text, family: font },
      },
    },
    xAxis: {
      axisLine: { color: t.axis },
      tickLine: { color: t.axis },
      tickText: { color: t.text, family: font },
    },
    yAxis: {
      axisLine: { color: t.axis },
      tickLine: { color: t.axis },
      tickText: { color: t.text, family: font },
    },
    crosshair: {
      horizontal: { line: { color: t.text }, text: { backgroundColor: t.axis, family: font } },
      vertical: { line: { color: t.text }, text: { backgroundColor: t.axis, family: font } },
    },
    separator: { color: t.axis },
  };
}
