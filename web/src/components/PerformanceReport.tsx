'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, BookOpen } from 'lucide-react';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useTradingStore, DEFAULT_ACCOUNT, type Trade } from '@/store/tradingStore';
import { computeStats, equityCurve, maeMfe } from '@/lib/performance';
import { getSymbolInfo } from '@/lib/symbols';
import { JournalModal } from './JournalModal';

function Spark({ values, color, fill }: { values: number[]; color: string; fill?: boolean }) {
  const W = 520;
  const H = 90;
  const d = useMemo(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * W;
        const y = H - ((v - min) / span) * H;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[90px] w-full">
      {fill && d && <path d={`${d} L${W},${H} L0,${H} Z`} fill={`${color}22`} stroke="none" />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export function PerformanceReport({ onClose }: { onClose: () => void }) {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const { symbol } = useActiveTab();
  const trades = useTradingStore((s) => s.trades[activeTabId] ?? []);
  const balance = useTradingStore((s) => (s.accounts[activeTabId] ?? DEFAULT_ACCOUNT).balance);
  const annotate = useTradingStore((s) => s.annotate);

  const stats = useMemo(() => computeStats(trades, balance), [trades, balance]);
  const eq = useMemo(() => equityCurve(trades, balance), [trades, balance]);

  const [journalTrade, setJournalTrade] = useState<Trade | null>(null);
  const [mm, setMm] = useState<Record<string, { mae: number; mfe: number }>>({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(trades.map(async (t) => [t.id, await maeMfe(symbol, t)] as const)).then((pairs) => {
      if (!cancelled) setMm(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [trades, symbol]);

  const money = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);
  const col = (n: number) => (n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-slate-400');

  const stat = (label: string, value: string, cls = 'text-slate-100') => (
    <div className="rounded border border-slate-800 px-2 py-1">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${cls}`}>{value}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-[680px] max-w-full flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <span className="text-sm font-semibold">Performance — {symbol.toUpperCase()}</span>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {trades.length === 0 ? (
            <div className="text-xs text-slate-500">No closed trades yet.</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {stat('Net P&L', money(stats.totalPnl), col(stats.totalPnl))}
                {stat('Trades', String(stats.trades))}
                {stat('Win rate', `${(stats.winRate * 100).toFixed(1)}%`)}
                {stat('Profit factor', stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2))}
                {stat('Expectancy', money(stats.expectancy), col(stats.expectancy))}
                {stat('Avg R', stats.avgR.toFixed(2), col(stats.avgR))}
                {stat('Sharpe', stats.sharpe.toFixed(2))}
                {stat('Max DD', stats.maxDrawdown.toFixed(2), 'text-red-400')}
              </div>

              <div className="rounded border border-slate-800 p-2">
                <div className="mb-1 text-[10px] uppercase text-slate-500">Equity curve</div>
                <Spark values={eq.map((p) => p.equity)} color="#3b82f6" fill />
              </div>
              <div className="rounded border border-slate-800 p-2">
                <div className="mb-1 text-[10px] uppercase text-slate-500">Drawdown</div>
                <Spark values={eq.map((p) => -p.drawdown)} color="#dc2626" fill />
              </div>

              {/* Trade journal */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-slate-500">Trades & journal</div>
                {[...trades].reverse().map((t: Trade) => (
                  <div key={t.id} className="rounded border border-slate-800 p-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className={t.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                        {t.side.toUpperCase()} {t.size}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        MFE {mm[t.id] ? money(mm[t.id].mfe) : '…'} / MAE {mm[t.id] ? money(mm[t.id].mae) : '…'}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`font-mono tabular-nums ${col(t.pnl)}`}>{money(t.pnl)}</span>
                        <button
                          type="button"
                          onClick={() => setJournalTrade(t)}
                          title="Journal this trade to Obsidian"
                          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700"
                        >
                          <BookOpen className="h-3 w-3" /> Journal
                        </button>
                      </span>
                    </div>
                    <div className="mt-1 flex gap-1">
                      <input
                        type="text"
                        defaultValue={t.note ?? ''}
                        placeholder="Note…"
                        onBlur={(e) => annotate(activeTabId, t.id, { note: e.target.value })}
                        className="flex-1 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-100"
                      />
                      <input
                        type="text"
                        defaultValue={t.tags ?? ''}
                        placeholder="tags"
                        onBlur={(e) => annotate(activeTabId, t.id, { tags: e.target.value })}
                        className="w-24 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-100"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {journalTrade && (
        <JournalModal
          trade={{
            side: journalTrade.side,
            entryTime: journalTrade.entryTime,
            entryPrice: journalTrade.entryPrice,
            exitTime: journalTrade.exitTime,
            exitPrice: journalTrade.exitPrice,
            sl: null,
            tp: null,
            pnl: journalTrade.pnl
          }}
          symbol={symbol}
          pricePrecision={getSymbolInfo(symbol).pricePrecision}
          onClose={() => setJournalTrade(null)}
        />
      )}
    </div>
  );
}
