'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { X, Sparkles, Play, Square, Save, ShieldCheck, BookOpen } from 'lucide-react';
import { AVAILABLE_SYMBOLS, getSymbolInfo } from '@/lib/symbols';
import { JournalModal } from './JournalModal';
import { Modal } from '@/components/ui/dialog';
import { useSettingsStore } from '@/store/settingsStore';
import { useActiveTab, useWorkspaceStore } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { useBacktestStore, type VizKey } from '@/store/backtestStore';
import {
  getStrategies,
  runBacktest,
  getCapabilities,
  listModels,
  getStrategyCode,
  validateStrategy,
  saveStrategy,
  generateStrategy,
  optimizeStrategy,
  calibrateDetectors,
  type StrategyInfo,
  type BacktestResult,
  type ModelInfo,
  type ValidateResult,
  type OptimizeResult,
  type CalibrateResult
} from '@/lib/strategyApi';

const TIMEFRAMES = ['m15', 'h1', 'h4', 'd1'];

function Sparkline({ values }: { values: number[] }) {
  const { path, w, h } = useMemo(() => {
    const W = 360;
    const H = 70;
    if (values.length < 2) return { path: '', w: W, h: H };
    const step = Math.max(1, Math.floor(values.length / W));
    const pts: number[] = [];
    for (let i = 0; i < values.length; i += step) pts.push(values[i]);
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const d = pts
      .map((v, i) => {
        const x = (i / (pts.length - 1)) * W;
        const y = H - ((v - min) / span) * H;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return { path: d, w: W, h: H };
  }, [values]);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[70px] w-full">
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
    </svg>
  );
}

function VizToggles() {
  const showZones = useBacktestStore((s) => s.showZones);
  const showLiquidity = useBacktestStore((s) => s.showLiquidity);
  const showStructure = useBacktestStore((s) => s.showStructure);
  const showTrades = useBacktestStore((s) => s.showTrades);
  const toggle = useBacktestStore((s) => s.toggle);

  const item = (key: VizKey, label: string, on: boolean) => (
    <label className="flex items-center gap-1 text-xs text-slate-400">
      <input type="checkbox" checked={on} onChange={() => toggle(key)} />
      {label}
    </label>
  );

  return (
    <div className="rounded border border-slate-800 p-2">
      <div className="mb-1 text-[10px] uppercase text-slate-500">Show on chart</div>
      <div className="flex flex-wrap gap-3">
        {item('showZones', 'FVG / OB', showZones)}
        {item('showLiquidity', 'Liquidity', showLiquidity)}
        {item('showStructure', 'BOS / MSS', showStructure)}
        {item('showTrades', 'Trades', showTrades)}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">
        Drawn on the active chart — run on the symbol you&apos;re viewing.
      </div>
    </div>
  );
}

const fmtTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

type Mode = 'run' | 'studio' | 'tune';

export function StrategiesPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('run');
  const [strategies, setStrategies] = useState<Record<string, StrategyInfo> | null>(null);
  const [offline, setOffline] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  // ICT Training (Studio + Tune) is a per-account module, gated on a custom claim.
  const { claims } = useAuth();
  const hasTraining = Boolean((claims.modules as Record<string, unknown> | undefined)?.ictTraining);

  const reloadStrategies = () =>
    getStrategies()
      .then((s) => {
        setStrategies(s);
        return s;
      })
      .catch(() => {
        setOffline(true);
        return null;
      });

  useEffect(() => {
    reloadStrategies().then((s) => {
      if (s) {
        const first = Object.keys(s)[0];
        setStrategy(first);
        setParams({ ...s[first].params });
      }
    });
    getCapabilities()
      .then((c) => setAiEnabled(c.ai))
      .catch(() => setAiEnabled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fall back to Run if ICT Training isn't (or is no longer) enabled.
  useEffect(() => {
    if (!hasTraining && mode !== 'run') setMode('run');
  }, [hasTraining, mode]);

  // --- Run mode state ---
  const activeTab = useActiveTab();
  const addTab = useWorkspaceStore((s) => s.addTab);
  const setResultStore = useBacktestStore((s) => s.setResult);
  const selectTrade = useBacktestStore((s) => s.select);
  // Result + selection live in the per-tab store, so they survive closing this
  // modal and switching tabs (kept until the next run for this tab).
  const result = useBacktestStore((s) => s.results[activeTab.id]) ?? null;
  const selectedTradeId = useBacktestStore((s) => s.selected[activeTab.id] ?? null);

  const [symbol, setSymbol] = useState(activeTab.symbol);
  const [timeframe, setTimeframe] = useState('h1');
  const [strategy, setStrategy] = useState('');
  const [params, setParams] = useState<Record<string, number>>({});
  const [scope, setScope] = useState<'session' | 'custom' | 'full'>('session');
  const [fromDate, setFromDate] = useState('2024-01-01');
  const [toDate, setToDate] = useState('2024-04-01');
  const [openNew, setOpenNew] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journalTrade, setJournalTrade] = useState<BacktestResult['trades'][number] | null>(null);

  const onStrategyChange = (nm: string) => {
    setStrategy(nm);
    if (strategies) setParams({ ...strategies[nm].params });
  };

  const tsOf = (d: string) => Date.parse(`${d}T00:00:00Z`);

  const run = async () => {
    setRunning(true);
    setError(null);

    let from: number | undefined;
    let to: number | undefined;
    let targetTabId = activeTab.id;
    if (scope === 'session') {
      from = activeTab.start;
      to = activeTab.end;
    } else if (scope === 'custom') {
      from = tsOf(fromDate);
      to = tsOf(toDate);
      // open the results as their own session so the chart is scoped to the range
      if (openNew) {
        addTab({
          symbol,
          label: `${symbol.toUpperCase()} backtest`,
          pricePrecision: getSymbolInfo(symbol).pricePrecision,
          start: from,
          end: to
        });
        targetTabId = useWorkspaceStore.getState().activeTabId; // the just-created tab
      }
    }

    try {
      const res = await runBacktest({ symbol, timeframe, strategy, params, from, to });
      // store the result on its tab — replaces the previous run, persists after close
      setResultStore(targetTabId, {
        symbol,
        strategy,
        timeframe,
        stats: res.stats,
        equity: res.equity,
        annotations: res.annotations ?? [],
        trades: res.trades,
        ranAt: Date.now(),
        // spread conditionally: Firestore persistence rejects undefined fields
        ...(res.settlement ? { settlement: res.settlement } : {})
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  // Select the trade + move the replay head to its EXIT, so the entry→exit
  // candles are within the visible window and the bracket draws over them
  // (the chart only renders candles up to the head).
  const jumpToTrade = (t: BacktestResult['trades'][number]) => {
    selectTrade(activeTab.id, t.id ?? null);
    useReplayStore.getState().setTimestamp(t.exitTime);
  };

  const stat = (label: string, value: string) => (
    <div className="rounded border border-slate-800 px-2 py-1">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );

  return (
    <Modal onClose={onClose} ariaLabel="ICT Strategies" className="w-[720px]">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">ICT Strategies</span>
            <div className="flex rounded border border-slate-700 text-xs">
              {((hasTraining ? ['run', 'studio', 'tune'] : ['run']) as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 ${mode === m ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  {m === 'studio' ? 'Studio (AI)' : m === 'tune' ? 'Tune' : 'Run'}
                </button>
              ))}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {offline ? (
            <div className="rounded border border-amber-900/60 bg-amber-950/30 p-3 text-xs text-amber-300">
              ICT engine is offline. Start it with:
              <pre className="mt-2 rounded bg-slate-950 p-2 text-slate-300">python engine/server.py</pre>
              then reopen this panel.
            </div>
          ) : !strategies ? (
            <div className="text-xs text-slate-500">Connecting to engine…</div>
          ) : mode === 'run' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-400">
                  Symbol
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                  >
                    {AVAILABLE_SYMBOLS.map((s) => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  Timeframe
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                  >
                    {TIMEFRAMES.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-2 block text-xs text-slate-400">
                Strategy
                <select
                  value={strategy}
                  onChange={(e) => onStrategyChange(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
                >
                  {Object.entries(strategies).map(([id, s]) => (
                    <option key={id} value={id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-1 text-[11px] text-slate-500">{strategies[strategy]?.description}</div>

              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(params).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-1 text-xs text-slate-400">
                    {k}
                    <input
                      type="number"
                      value={v}
                      onChange={(e) => setParams((p) => ({ ...p, [k]: Number(e.target.value) }))}
                      className="w-16 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs text-slate-100"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-2 rounded border border-slate-800 p-2">
                <div className="mb-1 text-[10px] uppercase text-slate-500">Date range</div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  {(['session', 'custom', 'full'] as const).map((sc) => (
                    <label key={sc} className="flex items-center gap-1">
                      <input type="radio" name="scope" checked={scope === sc} onChange={() => setScope(sc)} />
                      {sc === 'session' ? 'Current session' : sc === 'custom' ? 'Custom range' : 'Full history'}
                    </label>
                  ))}
                </div>
                {scope === 'custom' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 [color-scheme:dark]"
                    />
                    <span>→</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 [color-scheme:dark]"
                    />
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={openNew} onChange={(e) => setOpenNew(e.target.checked)} /> Open as new session
                    </label>
                  </div>
                )}
                {scope === 'full' && (
                  <div className="mt-1 text-[10px] text-amber-400">Full history can be slow on long timeframes.</div>
                )}
              </div>

              <button
                type="button"
                onClick={run}
                disabled={running}
                className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {running ? 'Running…' : 'Run backtest'}
              </button>

              {error && <div className="mt-2 text-xs text-red-400">{error}</div>}

              {result && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {stat('Total P&L', result.stats.totalPnl.toFixed(5))}
                    {stat('Trades', String(result.stats.trades))}
                    {stat('Win rate', `${(result.stats.winRate * 100).toFixed(1)}%`)}
                    {stat('Avg P&L', result.stats.avgPnl.toFixed(6))}
                    {stat('Max DD', result.stats.maxDrawdown.toFixed(5))}
                  </div>
                  <div className="rounded border border-slate-800 p-2">
                    <div className="mb-1 text-[10px] uppercase text-slate-500">Equity curve</div>
                    <Sparkline values={result.equity.map((e) => e.equity)} />
                  </div>
                  <VizToggles />

                  {result.trades.length > 0 && (
                    <div className="rounded border border-slate-800 p-2">
                      <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-slate-500">
                        <span>Trades ({result.trades.length})</span>
                        <div className="flex items-center gap-2">
                          <span className="normal-case">click a row to jump the chart</span>
                          <button
                            type="button"
                            disabled={!selectedTradeId}
                            onClick={() => {
                              const t = result.trades.find((x) => (x.id ?? null) === selectedTradeId);
                              if (t) setJournalTrade(t);
                            }}
                            title={selectedTradeId ? 'Journal the selected trade to Obsidian' : 'Select a trade first'}
                            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] normal-case text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                          >
                            <BookOpen className="h-3 w-3" /> Journal
                          </button>
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <table className="w-full text-[11px] tabular-nums">
                          <thead className="sticky top-0 bg-slate-900 text-slate-500">
                            <tr className="text-left">
                              <th className="px-1 py-0.5">Side</th>
                              <th className="px-1 py-0.5">Entry</th>
                              <th className="px-1 py-0.5">Exit</th>
                              <th className="px-1 py-0.5 text-right">R</th>
                              <th className="px-1 py-0.5 text-right">Pips</th>
                              <th className="px-1 py-0.5 text-right">P&amp;L</th>
                              <th className="px-1 py-0.5">Why</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.trades.map((t, i) => {
                              const r = t.risk ? (t.pnl / t.risk).toFixed(2) : '—';
                              const pipMult = Math.pow(10, getSymbolInfo(result.symbol).pricePrecision - 1);
                              const move = t.side === 'long' ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice;
                              const pips = (move * pipMult).toFixed(1);
                              const sel = (t.id ?? null) === selectedTradeId;
                              return (
                                <tr
                                  key={t.id ?? i}
                                  onClick={() => jumpToTrade(t)}
                                  className={`cursor-pointer ${sel ? 'bg-blue-900/40' : 'hover:bg-slate-800'}`}
                                >
                                  <td className={`px-1 py-0.5 ${t.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>{t.side}</td>
                                  <td className="px-1 py-0.5 text-slate-400">{fmtTime(t.entryTime)}</td>
                                  <td className="px-1 py-0.5 text-slate-400">{fmtTime(t.exitTime)}</td>
                                  <td className="px-1 py-0.5 text-right">{r}</td>
                                  <td className="px-1 py-0.5 text-right text-slate-400">{pips}</td>
                                  <td className={`px-1 py-0.5 text-right ${t.pnl > 0 ? 'text-green-400' : t.pnl < 0 ? 'text-red-400' : ''}`}>
                                    {(t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2)}
                                  </td>
                                  <td className="px-1 py-0.5 text-slate-500">{t.reason ?? ''}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : mode === 'studio' ? (
            <Studio
              strategies={strategies}
              aiEnabled={aiEnabled}
              onSaved={(nm) => reloadStrategies().then(() => setStrategy(nm))}
            />
          ) : (
            <Tune
              symbol={symbol}
              timeframe={timeframe}
              strategy={strategy}
              from={activeTab.start}
              to={activeTab.end}
              onApplyParams={(p) => {
                setParams((prev) => ({ ...prev, ...p }));
                setMode('run');
              }}
            />
          )}
        </div>

      {journalTrade && (
        <JournalModal
          trade={{
            side: journalTrade.side === 'short' ? 'short' : 'long',
            entryTime: journalTrade.entryTime,
            entryPrice: journalTrade.entryPrice,
            exitTime: journalTrade.exitTime,
            exitPrice: journalTrade.exitPrice,
            sl: journalTrade.sl ?? null,
            tp: journalTrade.tp ?? null,
            pnl: journalTrade.pnl
          }}
          symbol={result?.symbol ?? symbol}
          pricePrecision={getSymbolInfo(result?.symbol ?? symbol).pricePrecision}
          onClose={() => setJournalTrade(null)}
        />
      )}
    </Modal>
  );
}

// --- Studio: review / edit / AI-author -------------------------------------

function Studio({
  strategies,
  aiEnabled,
  onSaved
}: {
  strategies: Record<string, StrategyInfo>;
  aiEnabled: boolean;
  onSaved: (name: string) => void;
}) {
  const aiModel = useSettingsStore((s) => s.aiModel);
  const setAiModel = useSettingsStore((s) => s.setAiModel);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selected, setSelected] = useState<string>('__new__');
  const [code, setCode] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [name, setName] = useState('my_strategy');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (aiEnabled) listModels().then(setModels).catch(() => setModels([]));
  }, [aiEnabled]);

  const pick = async (value: string) => {
    setSelected(value);
    setValidation(null);
    if (value === '__new__') {
      setCode('');
      setReadOnly(false);
      setName('my_strategy');
      return;
    }
    try {
      const src = await getStrategyCode(value);
      setCode(src.code);
      setReadOnly(src.builtin);
      setName(src.builtin ? `${value}_v2` : value);
    } catch (e) {
      setBusyMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const generate = async () => {
    setGenerating(true);
    setValidation(null);
    setBusyMsg(null);
    setCode('');
    setReadOnly(false);
    abortRef.current = new AbortController();
    try {
      await generateStrategy(
        { description: prompt, base_code: selected === '__new__' ? undefined : code, model: aiModel, name },
        (t) => setCode((c) => c + t),
        abortRef.current.signal
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setBusyMsg(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setGenerating(false);
    }
  };

  const validate = async () => {
    setBusyMsg('Validating…');
    setValidation(null);
    try {
      setValidation(await validateStrategy(code));
      setBusyMsg(null);
    } catch (e) {
      setBusyMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setBusyMsg('Saving…');
    try {
      const res = await saveStrategy(name, code);
      if (res.ok && res.name) {
        setBusyMsg(`Saved as “${res.name}”.`);
        onSaved(res.name);
      } else {
        setValidation({ ok: false, errors: res.errors });
        setBusyMsg('Save rejected — fix the errors below.');
      }
    } catch (e) {
      setBusyMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          Open strategy
          <select
            value={selected}
            onChange={(e) => pick(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
          >
            <option value="__new__">✦ New (blank)</option>
            {Object.entries(strategies).map(([id, s]) => (
              <option key={id} value={id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Save as
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
          />
        </label>
      </div>

      {/* AI author */}
      <div className="rounded border border-slate-800 p-2">
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase text-slate-500">
          <Sparkles className="h-3.5 w-3.5" /> Describe a strategy
        </div>
        {!aiEnabled && (
          <div className="mb-2 rounded border border-amber-900/60 bg-amber-950/30 p-2 text-[11px] text-amber-300">
            AI authoring is off. Set <code>ANTHROPIC_API_KEY</code> and{' '}
            <code>pip install anthropic</code> for the engine, then reopen. You can still review,
            edit, validate and save code below.
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Long when price sweeps the prior-day low during the NY killzone then forms a bullish FVG; stop below the gap; target 2R."
          rows={3}
          disabled={!aiEnabled || generating}
          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 disabled:opacity-50"
        />
        <div className="mt-1 flex items-center gap-2">
          <label className="text-[11px] text-slate-400">Model</label>
          <select
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            disabled={!aiEnabled}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 disabled:opacity-50"
          >
            {(models.length ? models : [{ id: aiModel, display_name: aiModel }]).map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
          {generating ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="ml-auto flex items-center gap-1 rounded bg-slate-700 px-3 py-1 text-xs text-white hover:bg-slate-600"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={!aiEnabled || !prompt.trim()}
              className="ml-auto flex items-center gap-1 rounded bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
            >
              <Sparkles className="h-3 w-3" /> {selected === '__new__' ? 'Generate' : 'Edit with AI'}
            </button>
          )}
        </div>
      </div>

      {/* Code editor */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] uppercase text-slate-500">
            Code {readOnly && <span className="text-amber-400">(built-in — save creates a copy)</span>}
          </span>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={14}
          placeholder="# Generated or hand-written strategy appears here…"
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] leading-relaxed text-slate-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={validate}
          disabled={!code.trim()}
          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Validate
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!code.trim() || !name.trim()}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> Save
        </button>
        {busyMsg && <span className="text-xs text-slate-400">{busyMsg}</span>}
      </div>

      {validation && (
        <div
          className={`rounded border p-2 text-xs ${
            validation.ok
              ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-300'
              : 'border-red-900/60 bg-red-950/30 text-red-300'
          }`}
        >
          {validation.ok ? (
            <div className="flex items-center gap-2">
              <Play className="h-3.5 w-3.5" />
              Valid — smoke backtest: {validation.stats?.trades ?? 0} trades, P&L{' '}
              {(validation.stats?.totalPnl ?? 0).toFixed(2)}
            </div>
          ) : (
            <ul className="list-inside list-disc">
              {(validation.errors ?? ['validation failed']).map((er, i) => (
                <li key={i}>{er}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// --- Tune: optimize params + calibrate detectors against labels -------------

const METRICS = ['avgR', 'profitFactor', 'expectancy', 'winRate', 'totalPnl'] as const;

function Tune({
  symbol,
  timeframe,
  strategy,
  from,
  to,
  onApplyParams
}: {
  symbol: string;
  timeframe: string;
  strategy: string;
  from?: number;
  to?: number;
  onApplyParams: (params: Record<string, number>) => void;
}) {
  const [metric, setMetric] = useState<string>('avgR');
  const [trials, setTrials] = useState(20);
  const [optimizing, setOptimizing] = useState(false);
  const [optResult, setOptResult] = useState<OptimizeResult | null>(null);
  const [optErr, setOptErr] = useState<string | null>(null);

  const [calibrating, setCalibrating] = useState(false);
  const [calResult, setCalResult] = useState<CalibrateResult | null>(null);
  const [calErr, setCalErr] = useState<string | null>(null);

  const scope = from && to ? `${fmtTime(from)} → ${fmtTime(to)}` : 'full history';

  const optimize = async () => {
    setOptimizing(true);
    setOptErr(null);
    setOptResult(null);
    try {
      const res = await optimizeStrategy({
        symbol,
        timeframe,
        strategy,
        metric,
        trials,
        from,
        to,
        min_trades: 5
      });
      setOptResult(res);
    } catch (e) {
      setOptErr(e instanceof Error ? e.message : String(e));
    } finally {
      setOptimizing(false);
    }
  };

  const calibrate = async () => {
    setCalibrating(true);
    setCalErr(null);
    setCalResult(null);
    try {
      const res = await calibrateDetectors({ symbol, timeframe, from, to });
      setCalResult(res);
    } catch (e) {
      setCalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCalibrating(false);
    }
  };

  const paramList = (params: Record<string, number>) =>
    Object.entries(params).map(([k, v]) => (
      <span key={k} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
        {k}={typeof v === 'number' ? +v.toFixed(4) : String(v)}
      </span>
    ));

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-800 p-2 text-[11px] text-slate-400">
        Tuning <span className="font-mono text-slate-300">{strategy || '—'}</span> on{' '}
        <span className="font-mono text-slate-300">
          {symbol.toUpperCase()} {timeframe}
        </span>
        . Scoped to the current session ({scope}). Open a wider session to tune over more data.
      </div>

      {/* Optimize */}
      <div className="rounded border border-slate-800 p-2">
        <div className="mb-2 text-[11px] uppercase text-slate-500">Optimize params</div>
        <div className="flex flex-wrap items-end gap-2 text-xs text-slate-400">
          <label className="flex flex-col gap-0.5">
            Metric
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            Trials
            <input
              type="number"
              min={1}
              max={500}
              value={trials}
              onChange={(e) => setTrials(Math.max(1, Number(e.target.value)))}
              className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={optimize}
            disabled={optimizing || !strategy}
            className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {optimizing ? 'Searching…' : 'Optimize'}
          </button>
        </div>
        <div className="mt-1 text-[10px] text-slate-500">
          Runs {trials} backtests, maximizing {metric}. Larger ranges and trial counts take longer.
        </div>

        {optErr && <div className="mt-2 text-xs text-red-400">{optErr}</div>}
        {optResult && (
          <div className="mt-2 space-y-2 rounded border border-emerald-900/60 bg-emerald-950/20 p-2">
            <div className="text-xs text-emerald-300">
              Best {optResult.metric} = <span className="font-mono">{optResult.value.toFixed(4)}</span> over{' '}
              {optResult.trials} trials <span className="text-slate-500">({optResult.backend})</span>
            </div>
            <div className="flex flex-wrap gap-1">{paramList(optResult.params)}</div>
            <button
              type="button"
              onClick={() => onApplyParams(optResult.params)}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              Apply to Run params
            </button>
          </div>
        )}
      </div>

      {/* Calibrate */}
      <div className="rounded border border-slate-800 p-2">
        <div className="mb-2 text-[11px] uppercase text-slate-500">Calibrate detectors vs labels</div>
        <div className="text-[11px] text-slate-500">
          Sweeps detector thresholds to best match your tagged trades in{' '}
          <code>engine/labels/{symbol}.json</code>.
        </div>
        <button
          type="button"
          onClick={calibrate}
          disabled={calibrating}
          className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {calibrating ? 'Calibrating…' : 'Calibrate'}
        </button>

        {calErr && <div className="mt-2 text-xs text-red-400">{calErr}</div>}
        {calResult && !calResult.ok && (
          <div className="mt-2 rounded border border-amber-900/60 bg-amber-950/30 p-2 text-xs text-amber-300">
            {calResult.error}
          </div>
        )}
        {calResult && calResult.ok && calResult.best && (
          <div className="mt-2 space-y-2 rounded border border-emerald-900/60 bg-emerald-950/20 p-2">
            <div className="text-xs text-emerald-300">
              Best thresholds over {calResult.labels} labels
              {calResult.rows?.[0] && (
                <span className="text-slate-500">
                  {' '}
                  · coverage {(calResult.rows[0].coverage * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">{paramList(calResult.best)}</div>
            <button
              type="button"
              onClick={() => onApplyParams(calResult.best!)}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
            >
              Apply to Run params
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
