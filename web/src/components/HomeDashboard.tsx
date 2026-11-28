'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Play, Trash2, Copy, Search, Radio, Activity, Sun, FlaskConical } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTradingStore, DEFAULT_ACCOUNT } from '@/store/tradingStore';
import { computeStats } from '@/lib/performance';
import {
  copilotApi,
  type BacktestRunSummary,
  type DeskSnapshot,
  type ForecastWatchlistIdea,
  type LiveSignalDoc,
} from '@/lib/copilotApi';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { LiveRadarChartBoard } from '@/components/LiveRadarChartBoard';
import { BacktestVisualHubBoard } from '@/components/BacktestVisualHubBoard';
import { confirm } from '@/components/ui/confirm';
import { Tooltip } from '@/components/ui/tooltip';

const fmtDate = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : '—');
const money = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);
const col = (n: number) => (n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-slate-300');

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className={`font-mono text-lg tabular-nums ${cls ?? 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

/** Landing dashboard: aggregate performance + the list of backtesting sessions. */
type SortKey = 'recent' | 'name' | 'pnl';

export function HomeDashboard() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const openSession = useWorkspaceStore((s) => s.openSession);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const duplicateTab = useWorkspaceStore((s) => s.duplicateTab);
  const allTrades = useTradingStore((s) => s.trades);
  const accounts = useTradingStore((s) => s.accounts);
  const [newOpen, setNewOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [deskSnap, setDeskSnap] = useState<DeskSnapshot | null>(null);
  const [backtestRuns, setBacktestRuns] = useState<BacktestRunSummary[]>([]);
  const [activeLiveSignal, setActiveLiveSignal] = useState<LiveSignalDoc | null>(null);
  const [activeForecastBoard, setActiveForecastBoard] = useState<{
    idea: ForecastWatchlistIdea;
    session?: string;
  } | null>(null);
  const [activeLivePair, setActiveLivePair] = useState<{ symbol: string; title?: string; notes?: string } | null>(null);
  const [activeBacktest, setActiveBacktest] = useState<{ runId: string; symbol?: string; tradeId?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const radarId = params?.get('radar') || '';
    const forecastId = params?.get('forecast') || '';
    const pairParam = params?.get('pair') || '';
    const btRun = params?.get('backtest') || '';
    const btSym = params?.get('symbol') || '';
    const btTrade = params?.get('trade') || '';

    (async () => {
      try {
        const [snap, btRes] = await Promise.all([
          copilotApi.signals().catch(() => null),
          copilotApi.backtestRuns().catch(() => null),
        ]);
        if (cancelled) return;
        if (snap) setDeskSnap(snap);
        if (btRes?.runs) setBacktestRuns(btRes.runs);

        if (btRun) {
          setActiveBacktest({ runId: btRun, symbol: btSym || undefined, tradeId: btTrade || undefined });
        } else if (radarId && snap) {
          const hit = snap.signals.find((s) => s.signal_id === radarId || s.trade_id === radarId);
          if (hit) setActiveLiveSignal(hit);
        } else if (forecastId && pairParam && snap) {
          const fc = snap.forecasts.find((f) => f.forecast_id === forecastId) || snap.forecasts[0];
          const idea = fc?.forecast?.watchlist_ideas?.find(
            (i) => i.pair.toUpperCase() === pairParam.toUpperCase()
          );
          if (idea) {
            setActiveForecastBoard({ idea, session: fc?.session });
          } else {
            setActiveLivePair({ symbol: pairParam.toUpperCase(), title: `${pairParam.toUpperCase()} Live Forecast` });
          }
        } else if (pairParam) {
          setActiveLivePair({ symbol: pairParam.toUpperCase(), title: `${pairParam.toUpperCase()} Live Forecast` });
        }
      } catch {
        /* ignore if unauthenticated or twin cold */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (activeBacktest) {
    return (
      <BacktestVisualHubBoard
        runId={activeBacktest.runId}
        initialSymbol={activeBacktest.symbol}
        initialTradeId={activeBacktest.tradeId}
        runs={backtestRuns}
        onBack={() => {
          setActiveBacktest(null);
          if (typeof window !== 'undefined' && window.location.search) {
            window.history.replaceState({}, '', '/');
          }
        }}
      />
    );
  }

  if (activeLiveSignal || activeForecastBoard || activeLivePair) {
    return (
      <LiveRadarChartBoard
        signal={activeLiveSignal}
        forecastIdea={activeForecastBoard?.idea}
        forecastSession={activeForecastBoard?.session}
        fallbackSymbol={activeLivePair?.symbol}
        fallbackTitle={activeLivePair?.title}
        fallbackNotes={activeLivePair?.notes}
        onBack={() => {
          setActiveLiveSignal(null);
          setActiveForecastBoard(null);
          setActiveLivePair(null);
          if (typeof window !== 'undefined' && window.location.search) {
            window.history.replaceState({}, '', '/');
          }
        }}
        onSignalUpdated={() => {
          copilotApi.signals().then(setDeskSnap).catch(() => {});
        }}
      />
    );
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  const allSignals = deskSnap?.signals || [];
  const todaySignals = allSignals.filter((s) => (s.date || s.created_at || '').startsWith(todayUtc));
  const shownSignals = todaySignals.length > 0 ? todaySignals : allSignals.slice(0, 6);
  const latestForecast = deskSnap?.forecasts?.[0];
  const forecastIdeas = latestForecast?.forecast?.watchlist_ideas || [];
  const igHealth = deskSnap?.ig_shadow;

  const sessions = tabs
    .map((t) => {
      const trades = allTrades[t.id] ?? [];
      const stats = computeStats(trades, (accounts[t.id] ?? DEFAULT_ACCOUNT).balance);
      const wins = trades.filter((x) => x.pnl > 0).length;
      return { tab: t, trades, stats, wins };
    })
    .filter(({ tab }) => {
      const q = query.trim().toLowerCase();
      return !q || tab.label.toLowerCase().includes(q) || tab.symbol.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === 'name') return a.tab.label.localeCompare(b.tab.label);
      if (sort === 'pnl') return b.stats.totalPnl - a.stats.totalPnl;
      return (b.tab.lastOpenedAt ?? 0) - (a.tab.lastOpenedAt ?? 0);
    });

  const totalPnl = sessions.reduce((a, s) => a + s.stats.totalPnl, 0);
  const totalTrades = sessions.reduce((a, s) => a + s.stats.trades, 0);
  const totalWins = sessions.reduce((a, s) => a + s.wins, 0);
  const winRate = totalTrades ? (totalWins / totalTrades) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6">
      {/* SECTION 1: Co-Pilot Ephemeral Live Boards (Visual Chart Hub Slice 1) */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Radio className="h-4 w-4 text-emerald-400" />
              Co-Pilot Live Boards
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-normal text-slate-400">
                {todaySignals.length > 0 ? `Today (${todayUtc})` : 'Recent Radar Signals'} · Ephemeral
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Click any Radar signal to inspect live intraday candles, Entry/SL/TP brackets, and Option-1 rubric conviction on chart.
            </p>
          </div>
          {igHealth && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                igHealth.status === 'ONLINE'
                  ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                  : igHealth.status === 'STALE'
                    ? 'border-amber-500/40 bg-amber-950/30 text-amber-300'
                    : 'border-rose-500/40 bg-rose-950/30 text-rose-300'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              IG Shadow: {igHealth.status} ({igHealth.verified_epics}/{igHealth.total_epics} EPICs)
            </div>
          )}
        </div>

        {shownSignals.length === 0 && forecastIdeas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center text-xs text-slate-400">
            No live Radar setups or Morning Forecasts yet today. Boards appear here automatically during London &amp; NY Killzones.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {forecastIdeas.map((idea, idx) => (
              <div
                key={`fc-${idea.pair}-${idx}`}
                className="flex flex-col justify-between rounded-lg border border-indigo-500/30 bg-indigo-950/15 p-3.5 transition hover:border-indigo-400"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-slate-100">
                      <Sun className="h-3.5 w-3.5 text-amber-400" />
                      {idea.pair}
                    </span>
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-200">
                      {idea.bias}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {latestForecast?.session || 'Morning Forecast'} · {idea.setup_type || 'HTF Bias'}
                  </div>
                  {idea.narrative && (
                    <p className="mt-2 line-clamp-2 text-[11px] text-slate-300">{idea.narrative}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveForecastBoard({ idea, session: latestForecast?.session })}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded bg-indigo-600/20 py-1.5 text-xs font-medium text-indigo-200 ring-1 ring-indigo-500/30 hover:bg-indigo-600 hover:text-white"
                >
                  <Play className="h-3.5 w-3.5" /> Open Forecast Chart
                </button>
              </div>
            ))}
            {shownSignals.map((sig) => (
              <div
                key={sig.signal_id}
                className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-3.5 transition hover:border-sky-500/50"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-slate-100">
                      {sig.symbol} · {sig.tf}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        sig.direction === 'BULL'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {sig.direction}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{sig.verdict} (Grade {sig.grade || '?'})</span>
                    <span className="font-mono">{sig.date || ''}</span>
                  </div>
                  {sig.telemetry?.entry !== undefined && (
                    <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] text-slate-300">
                      <span className="text-sky-300">E: {sig.telemetry.entry}</span>
                      <span className="text-rose-400">SL: {sig.telemetry.sl}</span>
                      <span className="text-emerald-400">TP: {sig.telemetry.tp}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveLiveSignal(sig)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded bg-sky-600/20 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-sky-500/30 hover:bg-sky-600 hover:text-white"
                >
                  <Play className="h-3.5 w-3.5" /> Open Live Chart
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: Co-Pilot Backtest Visual Hub (Slice 3) */}
      <section className="border-t border-slate-800/80 pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <FlaskConical className="h-4 w-4 text-sky-400" />
              Co-Pilot Backtest Visual Hub
            </h2>
            <p className="text-xs text-slate-400">
              Step visually trade-by-trade through Co-Pilot&apos;s V5 &amp; Quant Lab backtests with trade-scoped FVG/OB/Sweep overlays.
            </p>
          </div>
        </div>

        {backtestRuns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-5 text-center text-xs text-slate-400">
            No exported Co-Pilot backtest runs found yet. Export a V5 or Quant Lab run to inspect trades visually here.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {backtestRuns.map((run) => (
              <div
                key={run.run_id}
                className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-3.5 transition hover:border-sky-500/50"
              >
                <div>
                  <div className="font-medium text-slate-100">{run.name}</div>
                  {run.description && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{run.description}</p>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
                    <div>
                      <div className="font-sans text-[10px] text-slate-500">Trades</div>
                      <div className="text-slate-200">{run.total_trades}</div>
                    </div>
                    <div>
                      <div className="font-sans text-[10px] text-slate-500">Win %</div>
                      <div className="text-sky-300">{run.win_rate.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="font-sans text-[10px] text-slate-500">Net (0.8p)</div>
                      <div className={run.net_r_08 >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {run.net_r_08 >= 0 ? `+${run.net_r_08}` : run.net_r_08}R
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveBacktest({
                      runId: run.run_id,
                      symbol: run.symbols?.[0]?.symbol,
                    })
                  }
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded bg-sky-600/20 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-sky-500/30 hover:bg-sky-600 hover:text-white"
                >
                  <Play className="h-3.5 w-3.5" /> Inspect Trades on Chart
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 3: Manual Replay Sessions */}
      <section className="border-t border-slate-800/80 pt-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Manual Replay Sessions</h2>
            <p className="text-xs text-slate-400">Your persistent historical replay sessions and paper performance.</p>
          </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              className="w-44 rounded border border-slate-700 bg-slate-800 py-1.5 pl-7 pr-2 text-sm text-slate-100"
            />
          </div>
          <select
            aria-label="Sort sessions"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="pnl">P&L</option>
          </select>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" /> New session
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total P&L" value={money(totalPnl)} cls={col(totalPnl)} />
        <Stat label="Trades" value={String(totalTrades)} />
        <Stat label="Win rate" value={`${winRate.toFixed(1)}%`} />
        <Stat label="Sessions" value={String(tabs.length)} />
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-400">
          No sessions yet.{' '}
          <button type="button" onClick={() => setNewOpen(true)} className="text-blue-400 hover:underline">
            Create your first session
          </button>
          .
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map(({ tab, stats }) => (
            <div key={tab.id} className="group flex flex-col rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{tab.label}</div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(tab.start)} → {fmtDate(tab.end)}
                  </div>
                </div>
                <div className="flex items-center">
                  <Tooltip label="Duplicate session (layout + drawings, fresh blotter)">
                    <button
                      type="button"
                      onClick={() => duplicateTab(tab.id)}
                      aria-label="Duplicate session"
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Delete session "${tab.label}"?`,
                          body: 'This permanently removes the session, its trades and its stats.',
                          danger: true,
                          confirmLabel: 'Delete'
                        })
                      )
                        closeTab(tab.id);
                    }}
                    title="Delete session"
                    aria-label="Delete session"
                    className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {cell('P&L', money(stats.totalPnl), `font-mono ${col(stats.totalPnl)}`)}
                {cell('Trades', String(stats.trades), 'font-mono')}
                {cell('Win', `${(stats.winRate * 100).toFixed(0)}%`, 'font-mono')}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                <span>Head at {fmtDate(tab.savedHead)}</span>
                {tab.lastOpenedAt && <span>Opened {fmtDate(tab.lastOpenedAt)}</span>}
              </div>
              <button
                type="button"
                onClick={() => openSession(tab.id)}
                className="mt-3 flex items-center justify-center gap-1 rounded bg-slate-800 py-1.5 text-sm hover:bg-slate-700"
              >
                <Play className="h-3.5 w-3.5" /> Open
              </button>
            </div>
          ))}
        </div>
      )}
      </section>

      {newOpen && <NewSessionDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function cell(label: string, value: string, cls: string): ReactNode {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className={cls}>{value}</div>
    </div>
  );
}
