'use client';

import { useEffect } from 'react';
import { useActiveTab, useWorkspaceStore } from '@/store/workspaceStore';
import { useChartStore } from '@/store/chartStore';
import { useBacktestStore } from '@/store/backtestStore';
import type { Pane } from '@/lib/layout';
import type { Timeframe } from '@/store/replayStore';
import { TabBar } from '@/components/TabBar';
import { TopToolbar } from '@/components/TopToolbar';
import { DrawingRail } from '@/components/DrawingRail';
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

function PaneView({ tabId, pane }: { tabId: string; pane: Pane }) {
  const activePaneId = useChartStore((s) => s.activePaneId);
  const setActivePane = useChartStore((s) => s.setActivePane);
  const setActivePaneTimeframe = useWorkspaceStore((s) => s.setActivePaneTimeframe);
  const active = activePaneId === pane.id;

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
      </div>
      <div className="relative min-h-0 flex-1">
        <CandleChart
          key={`${tabId}:${pane.id}:${pane.timeframe}`}
          tabId={tabId}
          paneId={pane.id}
          timeframe={pane.timeframe}
        />
      </div>
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
        <DrawingRail />
        <div className={`grid min-h-0 min-w-0 flex-1 gap-2 p-2 ${gridCls}`}>
          {panes.map((p) => (
            <PaneView key={p.id} tabId={tab.id} pane={p} />
          ))}
        </div>
        <TradingPanel />
      </div>

      <div className="flex items-center gap-4 border-t border-slate-800 bg-slate-900/60 px-3 py-2">
        <PlaybackBar />
        <HeadClock />
        <div className="ml-auto">
          <DateJump />
        </div>
      </div>

      <ChartPluginsBridge />
      <TradeLines />
      <IctAnnotations />
      <UserPluginsLoader />
      <OverlayContextMenu />
    </div>
  );
}
