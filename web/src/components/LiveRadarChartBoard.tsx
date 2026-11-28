'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { init, dispose, LineType, type Chart, type KLineData } from 'klinecharts';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Radio,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  copilotApi,
  type ForecastWatchlistIdea,
  type LiveCandlesResponse,
  type LiveSignalDoc,
} from '@/lib/copilotApi';
import { getSymbolInfo } from '@/lib/symbols';
import { buildKlineChartStyles } from '@/lib/chartThemeStyles';
import { registerIctTradeBox, ICT_TRADE_BOX } from '@/lib/overlays/ictTradeBox';
import { useSettingsStore } from '@/store/settingsStore';
import { useCopilotStore } from '@/store/copilotStore';

type LiveTf = 'm5' | 'm15' | 'h1' | 'h4';
const TF_LIST: { tf: LiveTf; label: string }[] = [
  { tf: 'm5', label: '5m' },
  { tf: 'm15', label: '15m' },
  { tf: 'h1', label: '1H' },
  { tf: 'h4', label: '4H' },
];

export function LiveRadarChartBoard({
  signal,
  forecastIdea,
  forecastSession,
  fallbackSymbol,
  fallbackTitle,
  fallbackNotes,
  onBack,
  onSignalUpdated,
}: {
  signal?: LiveSignalDoc | null;
  forecastIdea?: ForecastWatchlistIdea | null;
  forecastSession?: string;
  fallbackSymbol?: string;
  fallbackTitle?: string;
  fallbackNotes?: string;
  onBack: () => void;
  onSignalUpdated?: () => void;
}) {
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const theme = useSettingsStore((s) => s.theme);
  const timezone = useSettingsStore((s) => s.timezone);
  const symbol = (signal?.symbol || forecastIdea?.pair || fallbackSymbol || 'EURUSD').toUpperCase();
  const fcTf = forecastIdea?.chart_levels?.tf?.toLowerCase();
  const initialTf: LiveTf =
    signal?.tf?.toLowerCase() === 'm5' || signal?.tf?.toLowerCase() === '5m'
      ? 'm5'
      : signal?.tf?.toLowerCase() === 'h1' || signal?.tf?.toLowerCase() === '1h' || fcTf === 'h1'
        ? 'h1'
        : signal?.tf?.toLowerCase() === 'h4' || signal?.tf?.toLowerCase() === '4h' || fcTf === 'h4'
          ? 'h4'
          : 'm15';

  const [tf, setTf] = useState<LiveTf>(initialTf);
  const [feed, setFeed] = useState<LiveCandlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const loadCandles = useCallback(
    async (targetTf: LiveTf) => {
      setLoading(true);
      setErr(null);
      try {
        const res = await copilotApi.liveCandles(symbol, targetTf, 240);
        setFeed(res);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load live candles');
      } finally {
        setLoading(false);
      }
    },
    [symbol]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await copilotApi.liveCandles(symbol, tf, 240);
        if (!cancelled) {
          setFeed(res);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load live candles');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, tf]);

  // Initialize KLineChart instance once using global Settings chart theme & timezone
  useEffect(() => {
    registerIctTradeBox();
    const el = containerRef.current;
    if (!el) return;
    const curTheme = useSettingsStore.getState().theme;
    const curTz = useSettingsStore.getState().timezone;
    const chart = init(el, {
      styles: buildKlineChartStyles(curTheme),
    });
    if (!chart) return;
    chart.setTimezone(curTz);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      dispose(el);
      chartRef.current = null;
    };
  }, []);

  // Live-sync global Settings chart theme & timezone
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setStyles(buildKlineChartStyles(theme));
    chart.setTimezone(timezone);
  }, [theme, timezone]);

  // Push candles + R:R Zone box (Radar) or structured Forecast overlays whenever feed changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !feed?.candles?.length) return;
    const prec = getSymbolInfo(symbol.toLowerCase()).pricePrecision;
    chart.setPriceVolumePrecision(prec, 0);
    const klines: KLineData[] = feed.candles.map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    chart.applyNewData(klines);
    chart.removeOverlay();

    const anchorTs = klines[Math.max(0, klines.length - 20)].timestamp;
    const lastTs = klines[klines.length - 1].timestamp;

    if (
      signal?.telemetry &&
      typeof signal.telemetry.entry === 'number' &&
      typeof signal.telemetry.sl === 'number' &&
      typeof signal.telemetry.tp === 'number'
    ) {
      chart.createOverlay({
        name: ICT_TRADE_BOX,
        lock: true,
        points: [
          { timestamp: anchorTs, value: signal.telemetry.entry },
          { timestamp: lastTs, value: signal.telemetry.entry },
          { timestamp: anchorTs, value: signal.telemetry.sl },
          { timestamp: anchorTs, value: signal.telemetry.tp },
        ],
        extendData: {
          side: signal.direction === 'BEAR' ? 'short' : 'long',
          hasSl: true,
          hasTp: true,
          prec,
          qty: 1,
          pnl: 0,
        },
      });
      if (typeof signal.telemetry.sweep_level === 'number' && Number.isFinite(signal.telemetry.sweep_level)) {
        chart.createOverlay({
          name: 'horizontalStraightLine',
          lock: true,
          points: [{ timestamp: anchorTs, value: signal.telemetry.sweep_level }],
          styles: { line: { color: '#f59e0b', size: 1.5, style: LineType.Dashed } },
        });
      }
      return;
    }

    const fcLvl = forecastIdea?.chart_levels;
    const levels: Array<{ value?: number | null; color: string; dashed?: boolean }> = [
      { value: fcLvl?.poi_top, color: '#818cf8', dashed: true },
      { value: fcLvl?.poi_bottom, color: '#818cf8', dashed: true },
      { value: fcLvl?.draw_price, color: '#10b981' },
      { value: fcLvl?.invalidation_price, color: '#f43f5e' },
      { value: fcLvl?.sweep_level, color: '#f59e0b', dashed: true },
    ];
    for (const lvl of levels) {
      if (typeof lvl.value !== 'number' || !Number.isFinite(lvl.value) || lvl.value <= 0) continue;
      chart.createOverlay({
        name: 'horizontalStraightLine',
        lock: true,
        points: [{ timestamp: anchorTs, value: lvl.value }],
        styles: {
          line: {
            color: lvl.color,
            size: 1.5,
            style: lvl.dashed ? LineType.Dashed : LineType.Solid,
          },
        },
      });
    }
  }, [feed, signal, forecastIdea, symbol]);

  async function onAction(act: 'took' | 'skip' | 'win' | 'loss') {
    if (!signal) return;
    setActionBusy(act);
    try {
      const res = await copilotApi.signalAction(signal.signal_id, act);
      toast.success(`Logged "${act.toUpperCase()}" for ${signal.symbol} — ASR draft ${res.draft_id || 'staged'}.`);
      onSignalUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionBusy(null);
    }
  }

  const rubric = signal?.review?.visual_rubric;
  const prec = getSymbolInfo(symbol.toLowerCase()).pricePrecision;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-[#0b0f14] text-slate-100">
      {/* Top Ephemeral Board Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/70 px-4 py-2 text-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Chart Desk
          </button>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400" />
            <span className="font-mono text-sm font-bold text-white">{symbol}</span>
            {signal ? (
              <>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    signal.direction === 'BULL'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {signal.direction}
                </span>
                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                  {signal.verdict} · Grade {signal.grade || '?'}
                </span>
              </>
            ) : (
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                {fallbackTitle || 'Live Forecast Visual'}
              </span>
            )}
            <span className="hidden rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-400 md:inline">
              Ephemeral Live Board (Not Saved to Workspace)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded border border-slate-800 bg-slate-950 p-0.5">
            {TF_LIST.map((item) => (
              <button
                key={item.tf}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setTf(item.tf);
                }}
                className={`rounded px-2 py-0.5 font-mono text-[11px] ${
                  tf === item.tf ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {typeof feed?.ig_avg_spread_pips === 'number' && feed.ig_avg_spread_pips > 0 && (
            <span className="hidden rounded border border-emerald-500/30 bg-emerald-950/30 px-2 py-1 font-mono text-[11px] text-emerald-300 sm:inline">
              IG Spread: {feed.ig_avg_spread_pips}p
            </span>
          )}

          <button
            type="button"
            onClick={() => void loadCandles(tf)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Chart + Right Co-Pilot Conviction Rail */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Price-level Legend Strip */}
          {signal?.telemetry && (
            <div className="flex flex-wrap items-center gap-4 border-b border-slate-800/80 bg-slate-950/70 px-4 py-1.5 font-mono text-[11px]">
              {signal.telemetry.entry !== undefined && (
                <span className="text-sky-300">● Entry: {signal.telemetry.entry.toFixed(prec)}</span>
              )}
              {signal.telemetry.sl !== undefined && (
                <span className="text-rose-400">● SL: {signal.telemetry.sl.toFixed(prec)}</span>
              )}
              {signal.telemetry.tp !== undefined && (
                <span className="text-emerald-400">● TP: {signal.telemetry.tp.toFixed(prec)}</span>
              )}
              {signal.telemetry.sweep_level !== undefined && (
                <span className="text-amber-400">● Sweep: {signal.telemetry.sweep_level.toFixed(prec)}</span>
              )}
              {signal.telemetry.rr !== undefined && (
                <span className="text-slate-300">RR: {signal.telemetry.rr}R</span>
              )}
            </div>
          )}
          {!signal && forecastIdea?.chart_levels && (
            <div className="flex flex-wrap items-center gap-4 border-b border-slate-800/80 bg-slate-950/70 px-4 py-1.5 font-mono text-[11px]">
              {typeof forecastIdea.chart_levels.poi_top === 'number' && forecastIdea.chart_levels.poi_top > 0 && (
                <span className="text-indigo-300">
                  ● POI: {forecastIdea.chart_levels.poi_bottom?.toFixed(prec)}–{forecastIdea.chart_levels.poi_top.toFixed(prec)}
                </span>
              )}
              {typeof forecastIdea.chart_levels.draw_price === 'number' && forecastIdea.chart_levels.draw_price > 0 && (
                <span className="text-emerald-400">● DOL Target: {forecastIdea.chart_levels.draw_price.toFixed(prec)}</span>
              )}
              {typeof forecastIdea.chart_levels.invalidation_price === 'number' && forecastIdea.chart_levels.invalidation_price > 0 && (
                <span className="text-rose-400">● Inval: {forecastIdea.chart_levels.invalidation_price.toFixed(prec)}</span>
              )}
              {typeof forecastIdea.chart_levels.sweep_level === 'number' && forecastIdea.chart_levels.sweep_level > 0 && (
                <span className="text-amber-400">● Sweep: {forecastIdea.chart_levels.sweep_level.toFixed(prec)}</span>
              )}
            </div>
          )}

          {err && (
            <div className="m-4 rounded border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
              {err}
            </div>
          )}

          <div className="relative min-h-0 flex-1" style={{ backgroundColor: theme.background }}>
            {loading && !feed && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0f14]/80 text-xs text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-400" /> Loading live {symbol} {tf.toUpperCase()} candles…
              </div>
            )}
            <div ref={containerRef} className="h-full w-full" />
          </div>
        </div>

        {/* Right Panel: Co-Pilot Visual Conviction & Actions */}
        <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-800 bg-slate-950/80 p-4 text-xs lg:w-80 lg:border-l lg:border-t-0">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Co-Pilot Visual Conviction
          </h2>

          {signal ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Verdict</span>
                  <span className="font-mono font-semibold text-sky-300">{signal.verdict}</span>
                </div>
                {typeof signal.review?.recommended_risk_pct === 'number' && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-slate-400">Option-1 Risk Size</span>
                    <span className="font-mono font-semibold text-emerald-300">
                      {signal.review.recommended_risk_pct.toFixed(2)}%
                    </span>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-400">Trade ID</span>
                  <span className="font-mono text-[11px] text-slate-300">
                    {signal.trade_id || signal.signal_id.slice(0, 12)}
                  </span>
                </div>
              </div>

              {signal.review?.actionable_plan && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Actionable Plan</div>
                  <p className="leading-relaxed text-slate-200">{signal.review.actionable_plan}</p>
                </div>
              )}

              {rubric && Object.keys(rubric).length > 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase text-slate-400">
                    Option-1 8-Dimension Rubric
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(rubric).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate text-slate-400">{k.replace(/_/g, ' ')}</span>
                        <span
                          className={`font-mono font-semibold ${
                            v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-400'
                          }`}
                        >
                          {v > 0 ? `+${v}` : v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  Execution Log (Auto-Stages Obsidian ASR)
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['took', 'skip', 'win', 'loss'] as const).map((act) => {
                    const active = signal.user_action === act;
                    return (
                      <button
                        key={act}
                        type="button"
                        disabled={Boolean(actionBusy)}
                        onClick={() => void onAction(act)}
                        className={`inline-flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] font-medium capitalize ${
                          active
                            ? 'bg-sky-600 text-white'
                            : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {actionBusy === act ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : act === 'took' || act === 'win' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {act}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : forecastIdea ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Session</span>
                  <span className="font-mono text-slate-200">{forecastSession || 'Morning Forecast'}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate-400">Bias</span>
                  <span className="font-semibold text-indigo-300">{forecastIdea.bias}</span>
                </div>
                {forecastIdea.setup_type && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-slate-400">Model</span>
                    <span className="text-sky-300">{forecastIdea.setup_type}</span>
                  </div>
                )}
              </div>
              {forecastIdea.narrative && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase text-slate-400">HTF Narrative</div>
                  <p className="leading-relaxed text-slate-200">{forecastIdea.narrative}</p>
                </div>
              )}
              <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-[11px] text-slate-300">
                {forecastIdea.pa_reaction_zone && <div><strong className="text-indigo-300">POI Zone:</strong> {forecastIdea.pa_reaction_zone}</div>}
                {forecastIdea.pa_where_to_fill && <div><strong className="text-emerald-300">DOL Target:</strong> {forecastIdea.pa_where_to_fill}</div>}
                {forecastIdea.trigger_to_watch && <div><strong className="text-amber-300">Trigger:</strong> {forecastIdea.trigger_to_watch}</div>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-slate-300">
                {fallbackNotes || `Viewing live intraday ${symbol} candles from Co-Pilot.`}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              openDrawer({
                context: {
                  kind: signal ? 'live_signal' : 'live_board',
                  label: `${symbol} ${signal ? signal.direction : tf.toUpperCase()} Live Board`,
                  symbol,
                  timeframe: tf,
                  tradeId: signal?.trade_id || signal?.signal_id || symbol,
                  summary: signal?.review?.actionable_plan || fallbackNotes,
                },
                prefill: signal
                  ? `Walk me through ${symbol} ${signal.direction} (${signal.verdict}) and key invalidation levels.`
                  : `Analyze current live ${symbol} structure on 4H/1H/15m against my Living Constitution.`,
              })
            }
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Ask Co-Pilot About This Chart
          </button>
        </aside>
      </div>
    </div>
  );
}
