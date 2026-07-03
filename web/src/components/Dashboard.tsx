'use client';

import { useEffect } from 'react';
import { useActiveTab, useWorkspaceStore } from '@/store/workspaceStore';
import { useChartStore } from '@/store/chartStore';
import { useBacktestStore } from '@/store/backtestStore';
import { CHART_TYPES, type Pane, type PaneChartType } from '@/lib/layout';
import type { Timeframe } from '@/store/replayStore';
import { getSymbolInfo } from '@/lib/symbols';
import { registerHotkey } from '@/lib/hotkeys';
import { OhlcLegend } from '@/components/OhlcLegend';
import { ChartContextMenu } from '@/components/ChartContextMenu';
import { TabBar } from '@/components/TabBar';
import { TopToolbar } from '@/components/TopToolbar';
import { TimelineScrubber } from '@/components/TimelineScrubber';
import { DrawingToolbar } from '@/components/DrawingToolbar';
import { CandleChart } from '@/components/CandleChart';
import { PlaybackBar } from '@/components/PlaybackBar';
import { HeadClock } from '@/components/HeadClock';
import { DateJump } from '@/components/DateJump';
import { TradingPanel } from '@/components/TradingPanel';
import { TradeLines } from '@/components/TradeLines';
import { IctAnnotations } from '@/components/IctAnnotations';
import { ChartPluginsBridge } from '@/components/ChartPluginsBridge';
import { UserPluginsLoader } from '@/components/UserPluginsLoader';
import { OverlayContextMenu } from '@/components/OverlayContextMenu';

const TF_OPTIONS: { tf: Timeframe; name: string }[] = [
  { tf: 'm1', name: '1m' },
  { tf: 'm5', name: '5m' },
  { tf: 'm15', name: '15m' },
  { tf: 'h1', name: '1H' },
  { tf: 'h4', name: '4H' },
  { tf: 'd1', name: '1D' },
  { tf: 'w1', name: '1W' },
  { tf: 'mo1', name: '1M' }
];

function PaneView({ tabId, pane, symbol }: { tabId: string; pane: Pane; symbol: string }) {
  const activePaneId = useChartStore((s) => s.activePaneId);
  const setActivePane = useChartStore((s) => s.setActivePane);
  const setActivePaneTimeframe = useWorkspaceStore((s) => s.setActivePaneTimeframe);
  const setActivePaneChartType = useWorkspaceStore((s) => s.setActivePaneChartType);
  const active = activePaneId === pane.id;
  const { pricePrecision } = getSymbolInfo(symbol);

  return (
    <div
      onMouseDown={() => setActivePane(pane.id)}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded border ${
        active ? 'border-blue-500' : 'border-slate-800'
      }`}
    >
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900/40 px-2 py-1">
        <select
          aria-label="Pane timeframe"
          value={pane.timeframe}
          onChange={(e) => setActivePaneTimeframe(pane.id, e.target.value as Timeframe)}
          className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {TF_OPTIONS.map((o) => (
            <option key={o.tf} value={o.tf}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Pane chart type"
          value={pane.chartType ?? 'candle_solid'}
          onChange={(e) => setActivePaneChartType(pane.id, e.target.value as PaneChartType)}
          className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {CHART_TYPES.map((o) => (
            <option key={o.type} value={o.type}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <ChartContextMenu tabId={tabId} paneId={pane.id} symbol={symbol}>
        <OhlcLegend paneId={pane.id} symbol={symbol} timeframe={pane.timeframe} pricePrecision={pricePrecision} />
        <CandleChart
          key={`${tabId}:${pane.id}:${pane.timeframe}`}
          tabId={tabId}
          paneId={pane.id}
          timeframe={pane.timeframe}
          chartType={pane.chartType}
        />
      </ChartContextMenu>
    </div>
  );
}

/**
 * Trading shell: tabs, toolbar (layout / indicators), drawing rail, a grid of
 * 1/2/4 chart panes (each its own timeframe, all sharing the replay head), and a
 * bottom playback bar. The layout is taken from the ACTIVE tab, so it's
 * independent per tab.
 */
export function Dashboard() {
  const tab = useActiveTab();
  const { count, panes } = tab.layout;

  // Restore persisted backtest results (per tab) after a full reload.
  useEffect(() => {
    void useBacktestStore.getState().hydrate();
  }, []);

  // J arms one-shot Jump mode: the next chart click moves the replay head
  // (bare clicks never seek; Ctrl/Cmd+Click always works too).
  useEffect(
    () =>
      registerHotkey('j', 'Jump mode (next click moves the replay head)', 'Replay', () => {
        const cs = useChartStore.getState();
        cs.setJumpMode(!cs.jumpMode);
      }),
    []
  );

  const gridCls =
    count === 1
      ? 'grid-cols-1 grid-rows-1'
      : count === 2
        ? 'grid-cols-2 grid-rows-1'
        : 'grid-cols-2 grid-rows-2';

  return (
    <div className="flex h-screen flex-col bg-[#0b0f14] text-slate-100">
      <TabBar />
      <TopToolbar />

      <div className="flex min-h-0 flex-1">
        <DrawingToolbar />
        <div className={`grid min-h-0 min-w-0 flex-1 gap-2 p-2 ${gridCls}`}>
          {panes.map((p) => (
            <PaneView key={p.id} tabId={tab.id} pane={p} symbol={tab.symbol} />
          ))}
        </div>
        <TradingPanel />
      </div>

      <div className="flex items-center gap-4 border-t border-slate-800 bg-slate-900/60 px-3 py-2">
        <PlaybackBar />
        <TimelineScrubber />
        <HeadClock />
        <DateJump />
      </div>

      <ChartPluginsBridge />
      <TradeLines />
      <IctAnnotations />
      <UserPluginsLoader />
      <OverlayContextMenu />
    </div>
  );
}
