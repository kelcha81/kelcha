'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { init, dispose, LineType, type Chart, type KLineData } from 'klinecharts';
import {
  ArrowLeft,
  FlaskConical,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import {
  copilotApi,
  type BacktestRunSummary,
  type BacktestRunSymbolArtifact,
  type VisualBacktestTrade,
} from '@/lib/copilotApi';
import { getRange } from '@/lib/candleSource';
import { getSymbolInfo } from '@/lib/symbols';
import { useCopilotStore } from '@/store/copilotStore';

type BtTf = 'm15' | 'h1' | 'h4';
type TradeFilter = 'all' | 'win' | 'loss' | 'vetoed';

export function BacktestVisualHubBoard({
  runId,
  initialSymbol,
  runs,
  onBack,
}: {
  runId: string;
  initialSymbol?: string;
  runs: BacktestRunSummary[];
  onBack: () => void;
}) {
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const runMeta = runs.find((r) => r.run_id === runId);
  const defaultSym = (initialSymbol || runMeta?.symbols?.[0]?.symbol || 'EURJPY').toUpperCase();

  const [symbol, setSymbol] = useState(defaultSym);
  const [tf, setTf] = useState<BtTf>('m15');
  const [filter, setFilter] = useState<TradeFilter>('all');
  const [showBracket, setShowBracket] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [showZones, setShowZones] = useState(true);

  const [artifact, setArtifact] = useState<BacktestRunSymbolArtifact | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [loadingArt, setLoadingArt] = useState(true);
  const [artErr, setArtErr] = useState<string | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [candlesErr, setCandlesErr] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  // Load Visual Backtest Artifact for (runId, symbol)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await copilotApi.backtestRunSymbol(runId, symbol);
        if (cancelled) return;
        setArtifact(res);
        setArtErr(null);
        const first = res.trades?.[0]?.trade_id ?? null;
        setSelectedTradeId(first);
      } catch (e) {
        if (!cancelled) {
          setArtifact(null);
          setSelectedTradeId(null);
          setArtErr(e instanceof Error ? e.message : 'Failed to load visual backtest artifact');
        }
      } finally {
        if (!cancelled) setLoadingArt(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, symbol]);

  const filteredTrades = useMemo(() => {
    const list = artifact?.trades || [];
    return list.filter((t) => {
      if (filter === 'win') return t.outcome === 'WIN' && !t.vetoed;
      if (filter === 'loss') return t.outcome === 'LOSS' && !t.vetoed;
      if (filter === 'vetoed') return Boolean(t.vetoed);
      return true;
    });
  }, [artifact, filter]);

  const selectedTrade: VisualBacktestTrade | null = useMemo(() => {
    if (!filteredTrades.length) return null;
    return filteredTrades.find((t) => t.trade_id === selectedTradeId) || filteredTrades[0];
  }, [filteredTrades, selectedTradeId]);

  // Init KLineChart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = init(el, {
      styles: {
        grid: { horizontal: { color: '#1e293b' }, vertical: { color: '#1e293b' } },
        candle: {
          bar: {
            upColor: '#10b981',
            downColor: '#f43f5e',
            upBorderColor: '#10b981',
            downBorderColor: '#f43f5e',
            upWickColor: '#10b981',
            downWickColor: '#f43f5e',
          },
        },
        xAxis: { axisLine: { color: '#334155' }, tickText: { color: '#94a3b8' } },
        yAxis: { axisLine: { color: '#334155' }, tickText: { color: '#94a3b8' } },
      },
    });
    if (!chart) return;
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      dispose(el);
      chartRef.current = null;
    };
  }, []);

  // Load trade-scoped historical candle window from GCS/IndexedDB & draw trade-scoped overlays
  useEffect(() => {
    if (!selectedTrade) return;
    let cancelled = false;
    const symLower = symbol.toLowerCase();
    const padBefore = tf === 'm15' ? 48 * 3_600_000 : 120 * 3_600_000;
    const padAfter = tf === 'm15' ? 24 * 3_600_000 : 72 * 3_600_000;
    const from = Math.max(0, selectedTrade.entry_time - padBefore);
    const to = selectedTrade.exit_time + padAfter;

    (async () => {
      setCandlesLoading(true);
      setCandlesErr(null);
      try {
        const bars = await getRange(symLower, tf, from, to);
        if (cancelled) return;
        const chart = chartRef.current;
        if (!chart) return;
        const prec = getSymbolInfo(symLower).pricePrecision;
        chart.setPriceVolumePrecision(prec, 0);
        const klines: KLineData[] = bars.map((c) => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
        chart.applyNewData(klines);
        chart.removeOverlay();

        if (klines.length === 0) return;

        // 1) Entry / SL / TP bracket levels
        if (showBracket) {
          const bracket: Array<{ val: number; color: string; dashed?: boolean }> = [
            { val: selectedTrade.entry, color: '#38bdf8', dashed: true },
            { val: selectedTrade.sl, color: '#f43f5e' },
            { val: selectedTrade.tp, color: '#10b981' },
          ];
          for (const b of bracket) {
            if (!Number.isFinite(b.val)) continue;
            chart.createOverlay({
              name: 'horizontalStraightLine',
              lock: true,
              points: [{ timestamp: selectedTrade.entry_time, value: b.val }],
              styles: { line: { color: b.color, size: 1.5, style: b.dashed ? LineType.Dashed : LineType.Solid } },
            });
          }
        }

        // 2) Trade-scoped Sweep / BOS / MSS levels
        if (showLevels && selectedTrade.levels?.length) {
          for (const lv of selectedTrade.levels.slice(0, 8)) {
            chart.createOverlay({
              name: 'horizontalStraightLine',
              lock: true,
              points: [{ timestamp: lv.time || selectedTrade.entry_time, value: lv.price }],
              styles: {
                line: {
                  color: lv.type.includes('sweep') ? '#f59e0b' : '#a855f7',
                  size: 1,
                  style: LineType.Dashed,
                },
              },
            });
          }
        }

        // 3) Trade-scoped FVG / OB zone boundaries
        if (showZones && selectedTrade.zones?.length) {
          for (const z of selectedTrade.zones.slice(0, 6)) {
            const zColor = z.direction === 'bull' ? '#22c55e' : '#ef4444';
            chart.createOverlay({
              name: 'horizontalStraightLine',
              lock: true,
              points: [{ timestamp: z.t_start || selectedTrade.entry_time, value: z.top }],
              styles: { line: { color: zColor, size: 1, style: LineType.Dashed } },
            });
            chart.createOverlay({
              name: 'horizontalStraightLine',
              lock: true,
              points: [{ timestamp: z.t_start || selectedTrade.entry_time, value: z.bottom }],
              styles: { line: { color: zColor, size: 1, style: LineType.Dashed } },
            });
          }
        }
      } catch (e) {
        if (!cancelled) setCandlesErr(e instanceof Error ? e.message : 'Failed to load historical candles');
      } finally {
        if (!cancelled) setCandlesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTrade, symbol, tf, showBracket, showLevels, showZones]);

  const prec = getSymbolInfo(symbol.toLowerCase()).pricePrecision;
  const fmtTs = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-[#0b0f14] text-slate-100">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/70 px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Chart Desk
          </button>
          <FlaskConical className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-white">{runMeta?.name || runId}</span>

          <select
            aria-label="Backtest symbol"
            value={symbol}
            onChange={(e) => {
              setLoadingArt(true);
              setSymbol(e.target.value);
            }}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-sky-300"
          >
            {(runMeta?.symbols?.length
              ? runMeta.symbols
              : [{ symbol, trades: artifact?.stats.trades ?? 0, net_r_08: artifact?.stats.net_r_08 ?? 0 }]
            ).map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} ({s.trades}t · {s.net_r_08 >= 0 ? `+${s.net_r_08}` : s.net_r_08}R)
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-300">
            <input type="checkbox" checked={showBracket} onChange={(e) => setShowBracket(e.target.checked)} />
            Entry/SL/TP
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-300">
            <input type="checkbox" checked={showLevels} onChange={(e) => setShowLevels(e.target.checked)} />
            Sweep/MSS
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-300">
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
            FVG/OB
          </label>
          <div className="flex items-center rounded border border-slate-800 bg-slate-950 p-0.5">
            {(['m15', 'h1', 'h4'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTf(t)}
                className={`rounded px-2 py-0.5 font-mono text-[11px] uppercase ${
                  tf === t ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chart + Filterable Trade Auditor Rail */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 flex-col">
          {selectedTrade && (
            <div className="flex flex-wrap items-center gap-4 border-b border-slate-800/80 bg-slate-950/70 px-4 py-1.5 font-mono text-[11px]">
              <span className="font-semibold text-white">{selectedTrade.trade_id}</span>
              <span className={selectedTrade.direction === 'BULL' ? 'text-emerald-400' : 'text-rose-400'}>
                {selectedTrade.direction}
              </span>
              <span className="text-sky-300">Entry: {selectedTrade.entry.toFixed(prec)}</span>
              <span className="text-rose-400">SL: {selectedTrade.sl.toFixed(prec)}</span>
              <span className="text-emerald-400">TP: {selectedTrade.tp.toFixed(prec)}</span>
              <span className={selectedTrade.r_08 >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                0.8p: {selectedTrade.r_08 >= 0 ? `+${selectedTrade.r_08}` : selectedTrade.r_08}R
              </span>
              <span className="text-slate-400">
                1.2p: {selectedTrade.r_12 >= 0 ? `+${selectedTrade.r_12}` : selectedTrade.r_12}R
              </span>
              <span className="text-slate-500">{fmtTs(selectedTrade.entry_time)} UTC</span>
            </div>
          )}

          {(artErr || candlesErr) && (
            <div className="m-4 rounded border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
              {artErr || candlesErr}
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            {(loadingArt || candlesLoading) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0f14]/75 text-xs text-slate-300">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-400" />
                {loadingArt ? `Loading ${symbol} backtest trades…` : `Loading ${symbol} ${tf.toUpperCase()} window…`}
              </div>
            )}
            <div ref={containerRef} className="h-full w-full" />
          </div>
        </div>

        {/* Right Rail: Stats + Filter Pills + Click-to-Jump Trade List */}
        <aside className="flex w-full shrink-0 flex-col border-t border-slate-800 bg-slate-950/80 p-3 text-xs lg:w-80 lg:border-l lg:border-t-0">
          {artifact && (
            <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-center font-mono">
              <div>
                <div className="font-sans text-[9px] uppercase text-slate-500">Trades</div>
                <div className="text-sm font-bold text-slate-100">{artifact.stats.trades}</div>
              </div>
              <div>
                <div className="font-sans text-[9px] uppercase text-slate-500">Win %</div>
                <div className="text-sm font-bold text-sky-300">{artifact.stats.win_rate.toFixed(1)}%</div>
              </div>
              <div>
                <div className="font-sans text-[9px] uppercase text-slate-500">Net (0.8p)</div>
                <div className={`text-sm font-bold ${artifact.stats.net_r_08 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {artifact.stats.net_r_08 >= 0 ? `+${artifact.stats.net_r_08}` : artifact.stats.net_r_08}R
                </div>
              </div>
            </div>
          )}

          {/* Filter Pills */}
          <div className="mb-2 flex gap-1">
            {(['all', 'win', 'loss', 'vetoed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize ${
                  filter === f ? 'bg-sky-600 text-white' : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Clickable Trade List */}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {filteredTrades.length === 0 ? (
              <div className="rounded border border-slate-800 p-4 text-center text-[11px] text-slate-500">
                No trades match &ldquo;{filter}&rdquo;.
              </div>
            ) : (
              filteredTrades.map((t) => {
                const isSel = selectedTrade?.trade_id === t.trade_id;
                return (
                  <button
                    key={t.trade_id}
                    type="button"
                    onClick={() => setSelectedTradeId(t.trade_id)}
                    className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left transition ${
                      isSel
                        ? 'border-sky-500 bg-sky-950/40 text-white'
                        : 'border-slate-800/80 bg-slate-900/40 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className={t.direction === 'BULL' ? 'text-emerald-400' : 'text-rose-400'}>
                          {t.direction}
                        </span>
                        <span className="text-slate-400">{fmtTs(t.entry_time).slice(0, 10)}</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">{t.trade_id}</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className={`text-xs font-semibold ${t.r_08 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.r_08 >= 0 ? `+${t.r_08.toFixed(2)}` : t.r_08.toFixed(2)}R
                      </div>
                      <div className="text-[10px] text-slate-500">{t.outcome}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedTrade && (
            <button
              type="button"
              onClick={() =>
                openDrawer({
                  context: {
                    kind: 'backtest_trade',
                    label: `${symbol} ${selectedTrade.direction} (${selectedTrade.trade_id})`,
                    symbol,
                    timeframe: tf,
                    tradeId: selectedTrade.trade_id,
                    summary: `Backtest ${runId}: ${selectedTrade.outcome} (${selectedTrade.r_08}R @ 0.8p, ${selectedTrade.r_12}R @ 1.2p). Entry ${selectedTrade.entry}, SL ${selectedTrade.sl}, TP ${selectedTrade.tp}.`,
                  },
                  prefill: `Audit why ${selectedTrade.trade_id} on ${symbol} resulted in ${selectedTrade.outcome} (${selectedTrade.r_08}R) under our Living Constitution.`,
                })
              }
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Ask Co-Pilot About Trade
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
