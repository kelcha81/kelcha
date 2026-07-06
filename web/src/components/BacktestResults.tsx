'use client';

import { useWorkspaceStore } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { useBacktestStore, type VizKey } from '@/store/backtestStore';
import { getSymbolInfo } from '@/lib/symbols';

// Persistent backtest result for the active tab, shown in the side module next to
// paper trading. Survives closing the Strategies modal; replaced on the next run.
// Click a trade to jump the chart to it (and draw its SL/TP bracket).

const money = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);
const pnlColor = (n: number) => (n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-slate-400');

export function BacktestResults() {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const result = useBacktestStore((s) => s.results[activeTabId]);
  const selectedId = useBacktestStore((s) => s.selected[activeTabId] ?? null);
  const select = useBacktestStore((s) => s.select);
  const clear = useBacktestStore((s) => s.clear);
  const showZones = useBacktestStore((s) => s.showZones);
  const showLiquidity = useBacktestStore((s) => s.showLiquidity);
  const showStructure = useBacktestStore((s) => s.showStructure);
  const showTrades = useBacktestStore((s) => s.showTrades);
  const toggle = useBacktestStore((s) => s.toggle);

  if (!result) return null;

  const pipMult = Math.pow(10, getSymbolInfo(result.symbol).pricePrecision - 1);

  // Move the head to the trade's EXIT so its entry→exit candles are loaded and
  // the bracket draws over them (the chart renders only up to the head).
  const jump = (id: string | undefined, exitTime: number) => {
    select(activeTabId, id ?? null);
    useReplayStore.getState().setTimestamp(exitTime);
  };

  const s = result.stats;
  const toggleItem = (key: VizKey, label: string, on: boolean) => (
    <label className="flex items-center gap-1 text-[11px] text-slate-400">
      <input type="checkbox" checked={on} onChange={() => toggle(key)} /> {label}
    </label>
  );

  return (
    <div className="rounded-lg border border-slate-800 p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Backtest</span>
        <button type="button" onClick={() => clear(activeTabId)} className="text-[11px] text-slate-400 hover:text-white">
          Clear
        </button>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-slate-500">
        <span>
          {result.strategy} · {result.symbol.toUpperCase()} {result.timeframe}
        </span>
        {result.settlement && (
          <span
            title={
              result.settlement === 'm1'
                ? 'SL/TP resolved intra-bar by walking M1 candles'
                : 'No M1 data — SL and TP inside one bar settle pessimistically (SL first)'
            }
            className={`rounded px-1 text-[9px] uppercase ${
              result.settlement === 'm1'
                ? 'bg-emerald-900/50 text-emerald-400'
                : 'bg-amber-900/50 text-amber-400'
            }`}
          >
            {result.settlement === 'm1' ? 'M1 fills' : 'bar fills'}
          </span>
        )}
      </div>

      <div className="mt-1 grid grid-cols-3 gap-1 text-[11px]">
        <div>
          <div className="text-[9px] uppercase text-slate-500">P&amp;L</div>
          <div className={`font-mono tabular-nums ${pnlColor(s.totalPnl)}`}>{money(s.totalPnl)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase text-slate-500">Trades</div>
          <div className="font-mono tabular-nums">{s.trades}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase text-slate-500">Win</div>
          <div className="font-mono tabular-nums">{(s.winRate * 100).toFixed(0)}%</div>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap gap-2 border-t border-slate-800 pt-1">
        {toggleItem('showZones', 'FVG/OB', showZones)}
        {toggleItem('showLiquidity', 'Liq', showLiquidity)}
        {toggleItem('showStructure', 'BOS/MSS', showStructure)}
        {toggleItem('showTrades', 'Trades', showTrades)}
      </div>

      <div className="mt-1 max-h-44 space-y-0.5 overflow-y-auto border-t border-slate-800 pt-1">
        {result.trades.map((t, i) => {
          const sel = (t.id ?? null) === selectedId;
          const move = t.side === 'long' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice;
          const pips = move * pipMult;
          return (
            <button
              key={t.id ?? i}
              type="button"
              onClick={() => jump(t.id, t.exitTime)}
              className={`flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-[11px] ${
                sel ? 'bg-blue-900/40' : 'hover:bg-slate-800/40'
              }`}
            >
              <span className={t.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                {t.side === 'long' ? 'L' : 'S'}
              </span>
              <span className={`font-mono tabular-nums ${pnlColor(pips)}`}>{(pips >= 0 ? '+' : '') + pips.toFixed(1)}p</span>
              <span className="text-slate-600">{t.reason}</span>
              <span className={`font-mono tabular-nums ${pnlColor(t.pnl)}`}>{money(t.pnl)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
