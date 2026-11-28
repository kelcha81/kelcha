'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CandlestickChart,
  Code2,
  Database,
  Download,
  FileDown,
  Filter,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { CopilotNavShell } from '@/components/CopilotNavShell';
import {
  copilotApi,
  type BacktestRunSummary,
  type CompactModelTrade,
  type DataStudioQueryResponse,
  type DataStudioSchema,
  type PersonalAsrRecord,
} from '@/lib/copilotApi';
import { buildCopilotAsrMarkdown, downloadMarkdownFile } from '@/lib/obsidian/asr';
import { useCopilotStore } from '@/store/copilotStore';

const MONTHS = [
  { v: 1, label: 'Jan' },
  { v: 2, label: 'Feb' },
  { v: 3, label: 'Mar' },
  { v: 4, label: 'Apr' },
  { v: 5, label: 'May' },
  { v: 6, label: 'Jun' },
  { v: 7, label: 'Jul' },
  { v: 8, label: 'Aug' },
  { v: 9, label: 'Sep' },
  { v: 10, label: 'Oct' },
  { v: 11, label: 'Nov' },
  { v: 12, label: 'Dec' },
];

const CLUSTERS: Record<string, string[]> = {
  'USD Major': ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD'],
  'EUR Cross': ['EURJPY', 'EURGBP', 'EURCAD', 'EURCHF'],
  'GBP Cross': ['GBPCHF', 'GBPCAD', 'GBPAUD', 'GBPNZD'],
  'US Indices': ['US30', 'US500', 'NAS100'],
  Metals: ['XAUUSD', 'XAGUSD'],
  'JPY Other': ['AUDJPY'],
};

const SQL_TEMPLATES: Array<{ label: string; sql: string }> = [
  {
    label: 'Oct–Nov 2026: Model vs Gen-3 ASRs',
    sql: `SELECT 'MODEL' AS source, symbol, COUNT(*) AS trades,
       SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) AS wins,
       ROUND(SUM(r_08), 2) AS net_r
FROM model_trades
WHERE run_id = 'v5_18pair_baseline' AND ym >= '2026-10'
GROUP BY symbol
UNION ALL
SELECT 'GEN3_ASR' AS source, symbol, COUNT(*) AS trades,
       SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) AS wins,
       ROUND(COALESCE(SUM(pnl_r), 0), 2) AS net_r
FROM personal_asrs
WHERE executed = TRUE AND ym >= '2026-10'
GROUP BY symbol
ORDER BY symbol, source`,
  },
  {
    label: 'Monthly Trade Count (Model vs Gen-3 ASRs)',
    sql: `WITH m AS (
  SELECT ym, COUNT(*) AS model_trades, ROUND(SUM(r_08), 2) AS model_r
  FROM model_trades WHERE run_id = 'v5_18pair_baseline' AND ym >= '2026-10'
  GROUP BY ym
), a AS (
  SELECT ym, COUNT(*) AS asr_trades, ROUND(COALESCE(SUM(pnl_r), 0), 2) AS asr_r
  FROM personal_asrs WHERE executed = TRUE
  GROUP BY ym
)
SELECT COALESCE(m.ym, a.ym) AS month,
       COALESCE(m.model_trades, 0) AS model_n,
       COALESCE(a.asr_trades, 0) AS asr_n,
       COALESCE(m.model_r, 0) AS model_r_08,
       COALESCE(a.asr_r, 0) AS asr_r
FROM m LEFT JOIN a ON m.ym = a.ym
ORDER BY month DESC`,
  },
  {
    label: 'Rule Adherence vs Win Rate (Gen-3 ASRs)',
    sql: `SELECT CASE WHEN rules_violated_count = 0 THEN '0 Violations' ELSE '1+ Violations' END AS discipline,
       COUNT(*) AS trades,
       SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) AS wins,
       ROUND(100.0 * SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) AS wr_pct,
       ROUND(COALESCE(SUM(pnl_r), 0), 2) AS total_r
FROM personal_asrs
WHERE executed = TRUE
GROUP BY discipline`,
  },
  {
    label: 'Day-of-Week Edge (2025–2026 OOS)',
    sql: `SELECT dow, COUNT(*) AS trades,
       ROUND(100.0 * SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) AS wr_pct,
       ROUND(SUM(r_08), 2) AS net_r_08,
       ROUND(SUM(r_12), 2) AS net_r_12
FROM model_trades
WHERE run_id = 'v5_18pair_baseline' AND year >= 2025
GROUP BY dow
ORDER BY net_r_08 DESC`,
  },
  {
    label: 'Live Stage-3 Radar Signals',
    sql: `SELECT date, symbol, tf, direction, verdict, grade, user_action, outcome, r_outcome
FROM live_signals
ORDER BY date DESC
LIMIT 50`,
  },
];

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataStudioPage() {
  const openDrawer = useCopilotStore((s) => s.openDrawer);

  // Core studio mode & data state
  const [studioTab, setStudioTab] = useState<'visual' | 'sql'>('visual');
  const [runs, setRuns] = useState<BacktestRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('v5_18pair_baseline');
  const [schema, setSchema] = useState<DataStudioSchema | null>(null);
  const [modelTrades, setModelTrades] = useState<CompactModelTrade[]>([]);
  const [personalAsrs, setPersonalAsrs] = useState<PersonalAsrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Visual query filters
  const [spread, setSpread] = useState<'0.8p' | '1.2p'>('0.8p');
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'WIN' | 'LOSS'>('all');
  const [dirFilter, setDirFilter] = useState<'all' | 'BULL' | 'BEAR'>('all');
  const [executedAsrsOnly, setExecutedAsrsOnly] = useState(true);
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [chartType, setChartType] = useState<'freq' | 'equity' | 'pair_r'>('freq');
  const [tableTab, setTableTab] = useState<'model' | 'asr'>('model');

  // DuckDB SQL & AI-SQL state
  const [aiQuestion, setAiQuestion] = useState('');
  const [sqlText, setSqlText] = useState(SQL_TEMPLATES[0].sql);
  const [sqlBusy, setSqlBusy] = useState(false);
  const [sqlResult, setSqlResult] = useState<DataStudioQueryResponse | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  // Initial load (reads optional ?run=<run_id> query param)
  useEffect(() => {
    let cancelled = false;
    const urlRun =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('run') || '' : '';
    const initialRun = urlRun || 'v5_18pair_baseline';

    (async () => {
      try {
        const [schemaRes, allRes] = await Promise.all([
          copilotApi.dataSchema().catch(() => null),
          copilotApi.backtestRunAllTrades(initialRun).catch(() => null),
        ]);
        if (cancelled) return;
        if (schemaRes) {
          setSchema(schemaRes);
          setRuns(schemaRes.runs || []);
        }
        if (allRes?.ok) {
          setSelectedRunId(allRes.run_id);
          setModelTrades(allRes.trades || []);
          setPersonalAsrs(allRes.personal_asrs || []);
          setErr(null);
        } else if (schemaRes?.runs?.length) {
          const fallbackId = schemaRes.runs[0].run_id;
          const fb = await copilotApi.backtestRunAllTrades(fallbackId);
          if (!cancelled && fb.ok) {
            setSelectedRunId(fb.run_id);
            setModelTrades(fb.trades || []);
            setPersonalAsrs(fb.personal_asrs || []);
            setErr(null);
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load Data Studio');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function switchRun(runId: string, forceRefresh = false) {
    setSelectedRunId(runId);
    setLoading(true);
    setErr(null);
    try {
      const [schemaRes, allRes] = await Promise.all([
        copilotApi.dataSchema(forceRefresh),
        copilotApi.backtestRunAllTrades(runId),
      ]);
      setSchema(schemaRes);
      setRuns(schemaRes.runs || []);
      setModelTrades(allRes.trades || []);
      setPersonalAsrs(allRes.personal_asrs || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load run dataset');
    } finally {
      setLoading(false);
    }
  }

  const allSymbols = useMemo(() => {
    const s = new Set<string>();
    for (const t of modelTrades) if (t.symbol) s.add(t.symbol);
    for (const a of personalAsrs) if (a.symbol) s.add(a.symbol);
    return Array.from(s).sort();
  }, [modelTrades, personalAsrs]);

  const availableYears = useMemo(() => {
    const yrs = new Set<number>();
    for (const t of modelTrades) if (t.year > 0) yrs.add(t.year);
    for (const a of personalAsrs) if (a.year > 0) yrs.add(a.year);
    return Array.from(yrs).sort((a, b) => b - a);
  }, [modelTrades, personalAsrs]);

  const filteredModel = useMemo(() => {
    return modelTrades.filter((t) => {
      if (yearFilter !== 'all' && t.year !== yearFilter) return false;
      if (monthFilter !== 'all' && t.month !== monthFilter) return false;
      if (outcomeFilter !== 'all' && t.outcome !== outcomeFilter) return false;
      if (dirFilter !== 'all' && t.direction !== dirFilter) return false;
      if (selectedPairs.length > 0 && !selectedPairs.includes(t.symbol)) return false;
      return true;
    });
  }, [modelTrades, yearFilter, monthFilter, outcomeFilter, dirFilter, selectedPairs]);

  const filteredAsrs = useMemo(() => {
    return personalAsrs.filter((a) => {
      if (executedAsrsOnly && a.executed === false) return false;
      if (yearFilter !== 'all' && a.year !== yearFilter) return false;
      if (monthFilter !== 'all' && a.month !== monthFilter) return false;
      if (outcomeFilter !== 'all' && a.outcome !== outcomeFilter) return false;
      if (dirFilter !== 'all' && a.direction !== dirFilter) return false;
      if (selectedPairs.length > 0 && !selectedPairs.includes(a.symbol)) return false;
      return true;
    });
  }, [personalAsrs, executedAsrsOnly, yearFilter, monthFilter, outcomeFilter, dirFilter, selectedPairs]);

  const kpis = useMemo(() => {
    const mN = filteredModel.length;
    const mWins = filteredModel.filter((t) => t.outcome === 'WIN').length;
    const mNetR = filteredModel.reduce((acc, t) => acc + (spread === '0.8p' ? t.r_08 : t.r_12), 0);
    const mWr = mN ? (100 * mWins) / mN : 0;

    const aN = filteredAsrs.length;
    const aWins = filteredAsrs.filter((a) => a.outcome === 'WIN').length;
    const aNetR = filteredAsrs.reduce((acc, a) => acc + (a.pnl_r ?? 0), 0);
    const aWr = aN ? (100 * aWins) / aN : 0;
    const aValid = filteredAsrs.filter((a) => a.process_bucket.startsWith('VALID_PROCESS')).length;
    const aViol = filteredAsrs.filter((a) => a.do_not_imitate).length;

    return { mN, mWins, mNetR, mWr, aN, aWins, aNetR, aWr, aValid, aViol, countDelta: mN - aN };
  }, [filteredModel, filteredAsrs, spread]);

  // Grouped Bar Chart series: by Pair when filtered to 1 specific month+year, else by Month (YYYY-MM)
  const groupedByPair = yearFilter !== 'all' && monthFilter !== 'all';
  const freqSeries = useMemo(() => {
    const map = new Map<string, { label: string; modelN: number; asrN: number; modelR: number; asrR: number }>();
    for (const t of filteredModel) {
      const k = groupedByPair ? t.symbol : t.ym || 'Unknown';
      const cur = map.get(k) || { label: k, modelN: 0, asrN: 0, modelR: 0, asrR: 0 };
      cur.modelN += 1;
      cur.modelR += spread === '0.8p' ? t.r_08 : t.r_12;
      map.set(k, cur);
    }
    for (const a of filteredAsrs) {
      const k = groupedByPair ? a.symbol : a.ym || 'Unknown';
      const cur = map.get(k) || { label: k, modelN: 0, asrN: 0, modelR: 0, asrR: 0 };
      cur.asrN += 1;
      cur.asrR += a.pnl_r ?? 0;
      map.set(k, cur);
    }
    const list = Array.from(map.values());
    if (groupedByPair) {
      list.sort((x, y) => y.modelN + y.asrN - (x.modelN + x.asrN));
      return list;
    }
    list.sort((x, y) => x.label.localeCompare(y.label));
    return list.slice(-24);
  }, [filteredModel, filteredAsrs, groupedByPair, spread]);

  // Cumulative Equity Curve (R)
  const equitySeries = useMemo(() => {
    const mPts: Array<{ date: string; cumR: number }> = [];
    let acc = 0;
    for (const t of [...filteredModel].sort((a, b) => a.entry_time - b.entry_time)) {
      acc += spread === '0.8p' ? t.r_08 : t.r_12;
      mPts.push({ date: t.date, cumR: Number(acc.toFixed(2)) });
    }
    const aPts: Array<{ date: string; cumR: number }> = [];
    let aAcc = 0;
    for (const a of [...filteredAsrs].sort((x, y) => x.date.localeCompare(y.date))) {
      aAcc += a.pnl_r ?? 0;
      aPts.push({ date: a.date, cumR: Number(aAcc.toFixed(2)) });
    }
    return { mPts, aPts };
  }, [filteredModel, filteredAsrs, spread]);

  // Ranked Net R by Pair
  const pairAttribution = useMemo(() => {
    const map = new Map<string, { symbol: string; modelN: number; asrN: number; modelR: number; asrR: number }>();
    for (const t of filteredModel) {
      const cur = map.get(t.symbol) || { symbol: t.symbol, modelN: 0, asrN: 0, modelR: 0, asrR: 0 };
      cur.modelN += 1;
      cur.modelR += spread === '0.8p' ? t.r_08 : t.r_12;
      map.set(t.symbol, cur);
    }
    for (const a of filteredAsrs) {
      const cur = map.get(a.symbol) || { symbol: a.symbol, modelN: 0, asrN: 0, modelR: 0, asrR: 0 };
      cur.asrN += 1;
      cur.asrR += a.pnl_r ?? 0;
      map.set(a.symbol, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.modelR - a.modelR);
  }, [filteredModel, filteredAsrs, spread]);

  function togglePair(sym: string) {
    setSelectedPairs((prev) => (prev.includes(sym) ? prev.filter((x) => x !== sym) : [...prev, sym]));
  }

  function resetFilters() {
    setYearFilter('all');
    setMonthFilter('all');
    setOutcomeFilter('all');
    setDirFilter('all');
    setSelectedPairs([]);
  }

  async function runDirectSql(overrideSql?: string) {
    const q = (overrideSql ?? sqlText).trim();
    if (!q) return;
    setSqlBusy(true);
    setSqlError(null);
    try {
      const res = await copilotApi.dataQuery({ sql: q, run_id: selectedRunId });
      setSqlResult(res);
    } catch (e) {
      setSqlError(e instanceof Error ? e.message : 'DuckDB query failed');
    } finally {
      setSqlBusy(false);
    }
  }

  async function runAiSql(overrideQuestion?: string) {
    const q = (overrideQuestion ?? aiQuestion).trim();
    if (!q) return;
    setSqlBusy(true);
    setSqlError(null);
    try {
      const res = await copilotApi.dataQuery({ question: q, run_id: selectedRunId });
      setSqlResult(res);
      if (res.sql) setSqlText(res.sql);
      toast.success(`DuckDB executed in ${res.elapsed_ms}ms (${res.row_count} rows)`);
    } catch (e) {
      setSqlError(e instanceof Error ? e.message : 'AI SQL query failed');
    } finally {
      setSqlBusy(false);
    }
  }

  const filterSummaryLabel = [
    yearFilter === 'all' ? 'All Years' : String(yearFilter),
    monthFilter === 'all' ? 'All Months' : MONTHS.find((m) => m.v === monthFilter)?.label,
    outcomeFilter === 'all' ? 'All Outcomes' : outcomeFilter,
    dirFilter === 'all' ? 'Both Dirs' : dirFilter,
    selectedPairs.length ? selectedPairs.join(', ') : 'All Pairs',
  ].join(' · ');

  return (
    <CopilotNavShell
      title="Data Studio (DuckDB Analytics)"
      subtitle="Slice, filter, chart, and SQL-query Co-Pilot backtest runs side-by-side against your personal Obsidian ASRs and live Stage-3 Radar signals."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Lab backtest run"
            value={selectedRunId}
            onChange={(e) => void switchRun(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-sky-300"
          >
            {(runs.length ? runs : [{ run_id: selectedRunId, name: selectedRunId } as BacktestRunSummary]).map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.name}
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-md border border-slate-800 bg-slate-900 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSpread('0.8p')}
              className={`rounded px-2 py-1 font-mono ${spread === '0.8p' ? 'bg-sky-600 text-white' : 'text-slate-400'}`}
            >
              0.8p
            </button>
            <button
              type="button"
              onClick={() => setSpread('1.2p')}
              className={`rounded px-2 py-1 font-mono ${spread === '1.2p' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
            >
              1.2p
            </button>
          </div>

          <button
            type="button"
            onClick={() => void switchRun(selectedRunId, true)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      }
    >
      {/* Top Studio Mode Switcher + DuckDB Status Pill */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-1 text-xs">
          <button
            type="button"
            onClick={() => setStudioTab('visual')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
              studioTab === 'visual' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Visual Query &amp; Model vs. ASRs
          </button>
          <button
            type="button"
            onClick={() => setStudioTab('sql')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
              studioTab === 'sql' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            DuckDB SQL &amp; Ask Data (AI → SQL)
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 font-mono text-emerald-300">
            <Database className="h-3 w-3" />
            {schema?.engine === 'duckdb' ? 'DuckDB In-Memory' : schema?.engine || 'Analytics Engine'} ·{' '}
            {schema?.counts.model_trades ?? modelTrades.length} model ·{' '}
            {schema?.counts.personal_asrs ?? personalAsrs.length} ASRs ·{' '}
            {schema?.counts.live_signals ?? 0} live
          </span>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
          {err}
        </div>
      )}

      {/* ==================== TAB 1: VISUAL QUERY & MODEL VS ASRs ==================== */}
      {studioTab === 'visual' && (
        <div className="space-y-5">
          {/* Custom Filter Builder */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Filter className="h-3.5 w-3.5 text-sky-400" />
                Custom Filter Builder
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setYearFilter(2026);
                    setMonthFilter(6);
                    setOutcomeFilter('all');
                    setDirFilter('all');
                    setSelectedPairs([]);
                  }}
                  className="rounded border border-indigo-500/40 bg-indigo-600/15 px-2 py-0.5 text-indigo-200 hover:bg-indigo-600 hover:text-white"
                >
                  June 2026 vs ASRs
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setYearFilter(2026);
                    setMonthFilter('all');
                    setOutcomeFilter('all');
                  }}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-300 hover:bg-slate-800"
                >
                  2026 YTD
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setYearFilter('all');
                    setMonthFilter('all');
                    setOutcomeFilter('LOSS');
                  }}
                  className="rounded border border-rose-500/30 bg-rose-950/20 px-2 py-0.5 text-rose-300 hover:bg-rose-900/40"
                >
                  Losses Only
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-400 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Year</span>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
                >
                  <option value="all">All Years</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Month</span>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
                >
                  <option value="all">All Months</option>
                  {MONTHS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Outcome (Profit / Loss)</span>
                <select
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value as 'all' | 'WIN' | 'LOSS')}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
                >
                  <option value="all">All Outcomes</option>
                  <option value="WIN">Profit (Wins Only)</option>
                  <option value="LOSS">Loss Only</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Direction</span>
                <select
                  value={dirFilter}
                  onChange={(e) => setDirFilter(e.target.value as 'all' | 'BULL' | 'BEAR')}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
                >
                  <option value="all">Long &amp; Short</option>
                  <option value="BULL">Long (BULL)</option>
                  <option value="BEAR">Short (BEAR)</option>
                </select>
              </label>
            </div>

            {/* Cluster & Multi-Pair Picker */}
            <div className="mt-3 space-y-2 border-t border-slate-800/80 pt-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-[10px] uppercase text-slate-500">Clusters:</span>
                <button
                  type="button"
                  onClick={() => setSelectedPairs([])}
                  className={`rounded px-2 py-0.5 ${
                    selectedPairs.length === 0 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  All ({allSymbols.length})
                </button>
                {Object.entries(CLUSTERS).map(([cname, syms]) => (
                  <button
                    key={cname}
                    type="button"
                    onClick={() => setSelectedPairs(syms)}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-300 hover:border-sky-500/50 hover:text-white"
                  >
                    {cname}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {allSymbols.map((sym) => {
                  const active = selectedPairs.includes(sym);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => togglePair(sym)}
                      className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                        active
                          ? 'bg-sky-600 text-white'
                          : 'border border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-100'
                      }`}
                    >
                      {sym}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Model vs. Personal ASR Side-by-Side KPI Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-4">
              <div className="text-[10px] uppercase text-sky-300">Model Trades ({spread})</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-2xl font-bold text-white">{kpis.mN}</span>
                <span className={`text-sm font-semibold ${kpis.mNetR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {kpis.mNetR >= 0 ? `+${kpis.mNetR.toFixed(1)}` : kpis.mNetR.toFixed(1)}R
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                WR: {kpis.mWr.toFixed(1)}% ({kpis.mWins}W / {kpis.mN - kpis.mWins}L)
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-4">
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase text-amber-300">
                <span>Gen-3 Live ASRs (pnl_r)</span>
                <button
                  type="button"
                  onClick={() => setExecutedAsrsOnly((v) => !v)}
                  className="rounded border border-amber-500/40 bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-200 hover:bg-amber-800/40"
                >
                  {executedAsrsOnly ? 'Executed Only' : 'Incl. Missed/Draft'}
                </button>
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-2xl font-bold text-white">{kpis.aN}</span>
                <span className={`text-sm font-semibold ${kpis.aNetR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {kpis.aNetR >= 0 ? `+${kpis.aNetR.toFixed(1)}` : kpis.aNetR.toFixed(1)}R
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                WR: {kpis.aWr.toFixed(1)}% · Valid Process: {kpis.aValid} · Violations: {kpis.aViol}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-[10px] uppercase text-slate-500">Execution Delta (Model − You)</div>
              <div className="mt-1 font-mono text-2xl font-bold text-slate-100">
                {kpis.countDelta >= 0 ? `+${kpis.countDelta}` : kpis.countDelta} trades
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                R Gap: {kpis.mNetR - kpis.aNetR >= 0 ? '+' : ''}
                {(kpis.mNetR - kpis.aNetR).toFixed(1)}R on this slice
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-[10px] uppercase text-slate-500">Actions on Current Slice</div>
              <div className="mt-2 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    openDrawer({
                      context: {
                        kind: 'data_studio_slice',
                        label: `Data Studio: ${filterSummaryLabel}`,
                        summary: `Run ${selectedRunId} (${spread}): Model took ${kpis.mN} trades (${kpis.mWr.toFixed(1)}% WR, ${kpis.mNetR.toFixed(1)}R) vs Kelvin Personal ASRs ${kpis.aN} trades (${kpis.aWr.toFixed(1)}% WR, ${kpis.aNetR.toFixed(1)}R, ${kpis.aViol} violations).`,
                      },
                      prefill: `Analyze the gap between Model (${kpis.mN} trades, ${kpis.mNetR.toFixed(1)}R) and my Personal ASRs (${kpis.aN} trades, ${kpis.aNetR.toFixed(1)}R) for ${filterSummaryLabel}.`,
                    })
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Ask Co-Pilot About Slice
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `copilot_${selectedRunId}_${yearFilter}_${monthFilter}.csv`,
                      ['source', 'id', 'date', 'symbol', 'direction', 'outcome', 'r_08', 'r_12', 'notes'],
                      [
                        ...filteredModel.map((t) => ['MODEL', t.trade_id, t.date, t.symbol, t.direction, t.outcome, t.r_08, t.r_12, '']),
                        ...filteredAsrs.map((a) => ['PERSONAL_ASR', a.case_id, a.date, a.symbol, a.direction, a.outcome, a.pnl_r ?? '', '', a.process_bucket]),
                      ]
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <Download className="h-3 w-3" /> Export Filtered CSV
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Chart Studio */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Interactive Comparison Chart — {filterSummaryLabel}
                </h2>
                <p className="text-[11px] text-slate-400">
                  {chartType === 'freq'
                    ? groupedByPair
                      ? 'Showing Model vs. Personal ASR trade counts by pair (click a bar to isolate that pair).'
                      : 'Showing Model vs. Personal ASR trade counts by month (click a month bar to drill into it).'
                    : chartType === 'equity'
                      ? `Cumulative Net R curve (${spread} spread) comparing Model vs. Personal ASRs over the filtered slice.`
                      : `Ranked Net R attribution by pair (${spread} spread) for the active custom filter.`}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setChartType('freq')}
                  className={`rounded px-2.5 py-1 font-medium ${chartType === 'freq' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Trade Count (Model vs ASR)
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('equity')}
                  className={`rounded px-2.5 py-1 font-medium ${chartType === 'equity' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Cumulative Equity (R)
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('pair_r')}
                  className={`rounded px-2.5 py-1 font-medium ${chartType === 'pair_r' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Net R by Pair
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-xs text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-400" /> Loading datasets…
              </div>
            ) : chartType === 'freq' ? (
              freqSeries.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">No trades match the active filters.</div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5 text-sky-300">
                      <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Model Trades
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-300">
                      <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Your Personal ASRs
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    {(() => {
                      const maxVal = Math.max(1, ...freqSeries.flatMap((d) => [d.modelN, d.asrN]));
                      const barW = Math.max(36, Math.floor(860 / Math.max(freqSeries.length, 1)));
                      const W = Math.max(620, freqSeries.length * barW + 40);
                      const H = 220;
                      const chartH = 165;
                      return (
                        <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full min-w-[600px]">
                          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                            const y = 16 + chartH * (1 - frac);
                            return (
                              <g key={frac}>
                                <line x1={28} x2={W - 10} y1={y} y2={y} stroke="#1e293b" strokeWidth={1} />
                                <text x={24} y={y + 3} textAnchor="end" fill="#64748b" fontSize={9}>
                                  {Math.round(maxVal * frac)}
                                </text>
                              </g>
                            );
                          })}
                          {freqSeries.map((d, idx) => {
                            const gx = 34 + idx * barW;
                            const bw = Math.max(8, Math.min(18, Math.floor((barW - 10) / 2)));
                            const mh = (d.modelN / maxVal) * chartH;
                            const ah = (d.asrN / maxVal) * chartH;
                            return (
                              <g
                                key={d.label}
                                className="cursor-pointer"
                                onClick={() => {
                                  if (groupedByPair) {
                                    setSelectedPairs([d.label]);
                                  } else {
                                    const [yy, mm] = d.label.split('-').map(Number);
                                    if (yy && mm) {
                                      setYearFilter(yy);
                                      setMonthFilter(mm);
                                    }
                                  }
                                }}
                              >
                                <title>
                                  {`${d.label}: Model ${d.modelN} (${d.modelR >= 0 ? '+' : ''}${d.modelR.toFixed(1)}R) vs ASRs ${d.asrN} (${d.asrR >= 0 ? '+' : ''}${d.asrR.toFixed(1)}R)`}
                                </title>
                                <rect
                                  x={gx}
                                  y={16 + chartH - mh}
                                  width={bw}
                                  height={Math.max(1, mh)}
                                  rx={2}
                                  fill="#0ea5e9"
                                />
                                {d.modelN > 0 && (
                                  <text x={gx + bw / 2} y={13 + chartH - mh} textAnchor="middle" fill="#7dd3fc" fontSize={9}>
                                    {d.modelN}
                                  </text>
                                )}
                                <rect
                                  x={gx + bw + 2}
                                  y={16 + chartH - ah}
                                  width={bw}
                                  height={Math.max(d.asrN > 0 ? 2 : 0, ah)}
                                  rx={2}
                                  fill="#f59e0b"
                                />
                                {d.asrN > 0 && (
                                  <text x={gx + bw + 2 + bw / 2} y={13 + chartH - ah} textAnchor="middle" fill="#fcd34d" fontSize={9}>
                                    {d.asrN}
                                  </text>
                                )}
                                <text
                                  x={gx + bw}
                                  y={H - 12}
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize={9}
                                >
                                  {groupedByPair ? d.label : d.label.slice(2)}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )
            ) : chartType === 'equity' ? (
              (() => {
                const { mPts, aPts } = equitySeries;
                if (!mPts.length && !aPts.length) {
                  return <div className="py-10 text-center text-xs text-slate-500">No trades to plot.</div>;
                }
                const allVals = [0, ...mPts.map((p) => p.cumR), ...aPts.map((p) => p.cumR)];
                const minV = Math.min(...allVals);
                const maxV = Math.max(...allVals);
                const span = maxV - minV || 1;
                const W = 820;
                const H = 210;
                const yOf = (v: number) => 16 + ((maxV - v) / span) * 165;
                const toPath = (pts: Array<{ cumR: number }>) =>
                  pts
                    .map((p, i) => {
                      const x = 42 + (i / Math.max(1, pts.length - 1)) * (W - 60);
                      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yOf(p.cumR).toFixed(1)}`;
                    })
                    .join(' ');
                return (
                  <div>
                    <div className="mb-2 flex items-center gap-4 text-[11px]">
                      <span className="text-sky-300">
                        — Model ({mPts.length ? `${mPts[mPts.length - 1].cumR >= 0 ? '+' : ''}${mPts[mPts.length - 1].cumR}R` : '0R'})
                      </span>
                      <span className="text-amber-300">
                        — Personal ASRs ({aPts.length ? `${aPts[aPts.length - 1].cumR >= 0 ? '+' : ''}${aPts[aPts.length - 1].cumR}R` : '0R'})
                      </span>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full">
                      <line x1={42} x2={W - 16} y1={yOf(0)} y2={yOf(0)} stroke="#475569" strokeDasharray="4 4" strokeWidth={1} />
                      <text x={36} y={yOf(maxV) + 3} textAnchor="end" fill="#64748b" fontSize={9}>
                        {maxV.toFixed(0)}R
                      </text>
                      <text x={36} y={yOf(0) + 3} textAnchor="end" fill="#94a3b8" fontSize={9}>
                        0R
                      </text>
                      <text x={36} y={yOf(minV) + 3} textAnchor="end" fill="#64748b" fontSize={9}>
                        {minV.toFixed(0)}R
                      </text>
                      {mPts.length > 1 && <path d={toPath(mPts)} fill="none" stroke="#0ea5e9" strokeWidth={2} />}
                      {aPts.length > 1 && <path d={toPath(aPts)} fill="none" stroke="#f59e0b" strokeWidth={2} />}
                    </svg>
                  </div>
                );
              })()
            ) : (
              <div className="space-y-1.5">
                {pairAttribution.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">No pairs match the filter.</div>
                ) : (
                  (() => {
                    const maxAbs = Math.max(1, ...pairAttribution.map((p) => Math.abs(p.modelR)));
                    return pairAttribution.map((p) => {
                      const pct = Math.min(100, (Math.abs(p.modelR) / maxAbs) * 100);
                      return (
                        <div key={p.symbol} className="grid grid-cols-12 items-center gap-2 text-xs">
                          <span className="col-span-2 font-mono font-semibold text-slate-200">{p.symbol}</span>
                          <div className="col-span-6 h-4 rounded bg-slate-950 p-0.5">
                            <div
                              className={`h-full rounded ${p.modelR >= 0 ? 'bg-emerald-500/80' : 'bg-rose-500/80'}`}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                          <span className={`col-span-2 text-right font-mono ${p.modelR >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {p.modelR >= 0 ? `+${p.modelR.toFixed(1)}` : p.modelR.toFixed(1)}R ({p.modelN}t)
                          </span>
                          <div className="col-span-2 text-right">
                            <Link
                              href={`/?backtest=${encodeURIComponent(selectedRunId)}&symbol=${encodeURIComponent(p.symbol)}`}
                              className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-600/15 px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-sky-600 hover:text-white"
                            >
                              <CandlestickChart className="h-3 w-3" /> Chart
                            </Link>
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            )}
          </div>

          {/* Drill-Down Records Table: Model Trades vs. Personal ASRs */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTableTab('model')}
                  className={`rounded px-3 py-1 font-medium ${tableTab === 'model' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Model Trades ({filteredModel.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTableTab('asr')}
                  className={`rounded px-3 py-1 font-medium ${tableTab === 'asr' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Personal ASRs ({filteredAsrs.length})
                </button>
              </div>
              <span className="text-[11px] text-slate-500">
                Showing up to 150 rows (use Export CSV for full filtered set)
              </span>
            </div>

            {tableTab === 'model' ? (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Pair</th>
                      <th className="px-2 py-2">Dir</th>
                      <th className="px-2 py-2">Trade ID</th>
                      <th className="px-2 py-2 text-right">0.8p R</th>
                      <th className="px-2 py-2 text-right">1.2p R</th>
                      <th className="px-2 py-2 text-right">Outcome</th>
                      <th className="px-2 py-2 text-right">Visual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredModel.slice(0, 150).map((t) => (
                      <tr key={`${t.symbol}-${t.trade_id}`} className="hover:bg-slate-800/40">
                        <td className="px-2 py-1.5 text-slate-300">{t.date}</td>
                        <td className="px-2 py-1.5 font-semibold text-white">{t.symbol}</td>
                        <td className={`px-2 py-1.5 ${t.direction === 'BULL' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.direction}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400">{t.trade_id}</td>
                        <td className={`px-2 py-1.5 text-right ${t.r_08 >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {t.r_08 >= 0 ? `+${t.r_08.toFixed(2)}` : t.r_08.toFixed(2)}R
                        </td>
                        <td className={`px-2 py-1.5 text-right ${t.r_12 >= 0 ? 'text-slate-300' : 'text-rose-400'}`}>
                          {t.r_12 >= 0 ? `+${t.r_12.toFixed(2)}` : t.r_12.toFixed(2)}R
                        </td>
                        <td className="px-2 py-1.5 text-right font-sans">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              t.outcome === 'WIN' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {t.outcome}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-sans">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/?backtest=${encodeURIComponent(selectedRunId)}&symbol=${encodeURIComponent(t.symbol)}&trade=${encodeURIComponent(t.trade_id)}`}
                              className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-600/15 px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-sky-600 hover:text-white"
                            >
                              <CandlestickChart className="h-3 w-3" /> R:R Chart
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                const { filename, markdown } = buildCopilotAsrMarkdown({
                                  date: t.date,
                                  symbol: t.symbol,
                                  direction: t.direction,
                                  entry: t.entry,
                                  sl: t.sl,
                                  tp: t.tp,
                                  pnlR: spread === '0.8p' ? t.r_08 : t.r_12,
                                  outcome: t.outcome,
                                  signalId: `${selectedRunId}:${t.trade_id}`,
                                  verdict: selectedRunId,
                                });
                                downloadMarkdownFile(filename, markdown);
                                toast.success(`Downloaded ${filename}`);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-600/15 px-1.5 py-0.5 text-[10px] text-amber-200 hover:bg-amber-600 hover:text-white"
                              title="Export Gen-3 Obsidian Daily ASR (.md)"
                            >
                              <FileDown className="h-3 w-3" /> .md
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredModel.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 text-center font-sans text-slate-500">
                          No model trades match this custom filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Pair</th>
                      <th className="px-2 py-2">Dir</th>
                      <th className="px-2 py-2">KZ</th>
                      <th className="px-2 py-2">Outcome</th>
                      <th className="px-2 py-2 text-right">PnL R</th>
                      <th className="px-2 py-2">Entry / SL / TP</th>
                      <th className="px-2 py-2 text-right">Rules</th>
                      <th className="px-2 py-2">Skeptic Bucket</th>
                      <th className="px-2 py-2">Takeaway</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAsrs.slice(0, 150).map((a) => (
                      <tr key={a.case_id} className="hover:bg-slate-800/40">
                        <td className="px-2 py-1.5 font-mono text-slate-300">{a.date}</td>
                        <td className="px-2 py-1.5 font-mono font-semibold text-white">{a.symbol || '—'}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-300">{a.direction}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">{a.killzone || '—'}</td>
                        <td className="px-2 py-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              a.outcome === 'WIN'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : a.outcome === 'LOSS'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : a.outcome === 'MISSED'
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {a.outcome}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-200">
                          {a.pnl_r !== null ? `${a.pnl_r >= 0 ? '+' : ''}${a.pnl_r.toFixed(2)}R` : '—'}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">
                          {a.entry != null ? `${a.entry} / ${a.sl ?? '—'} / ${a.tp ?? '—'}` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-[10px]">
                          {a.rules_followed_count || a.rules_violated_count ? (
                            <span className={(a.rules_violated_count ?? 0) > 0 ? 'text-rose-300' : 'text-emerald-300'}>
                              ✓{a.rules_followed_count ?? 0} / ✗{a.rules_violated_count ?? 0}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">{a.process_bucket}</td>
                        <td className="max-w-xs truncate px-2 py-1.5 text-[11px] text-slate-300">
                          {a.key_rule_takeaway || '—'}
                        </td>
                      </tr>
                    ))}
                    {filteredAsrs.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-6 text-center text-slate-500">
                          No Gen-3 Live ASRs match this custom filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: DUCKDB SQL & ASK DATA (AI -> SQL) ==================== */}
      {studioTab === 'sql' && (
        <div className="space-y-5">
          {/* Natural Language AI -> SQL Bar */}
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/15 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-200">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              Ask Data in Plain English (Gemini → Read-Only DuckDB SQL)
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runAiSql();
                }}
                placeholder="e.g., How many trades did V5 take in June 2026 vs my personal ASRs by pair?"
                className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                disabled={sqlBusy || !aiQuestion.trim()}
                onClick={() => void runAiSql()}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {sqlBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Generate &amp; Run SQL
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
              {[
                'Compare how many trades V5 took in June 2026 vs my personal ASRs by pair',
                'Which UTC entry hours have the highest net R at 0.8p in 2025-2026?',
                'Compare win rate and net R by asset cluster at 0.8p vs 1.2p spread',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setAiQuestion(q);
                    void runAiSql(q);
                  }}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-left text-slate-300 hover:border-indigo-500/50 hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left: SQL Editor + Templates */}
            <div className="space-y-3 lg:col-span-8">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200">Read-Only DuckDB SQL Editor</span>
                  <div className="flex flex-wrap gap-1">
                    {SQL_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => {
                          setSqlText(tpl.sql);
                          void runDirectSql(tpl.sql);
                        }}
                        className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-300 hover:border-sky-500 hover:text-white"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={8}
                  value={sqlText}
                  onChange={(e) => setSqlText(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-[#070a0f] p-3 font-mono text-xs text-sky-200 outline-none focus:border-sky-500"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    Read-only SELECT/WITH sandbox · External file/network access disabled · Max 500 rows
                  </span>
                  <button
                    type="button"
                    disabled={sqlBusy || !sqlText.trim()}
                    onClick={() => void runDirectSql()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
                  >
                    {sqlBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Run DuckDB Query
                  </button>
                </div>
              </div>

              {sqlError && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
                  {sqlError}
                </div>
              )}

              {sqlResult && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-100">
                        Result ({sqlResult.row_count} rows · {sqlResult.elapsed_ms}ms · {sqlResult.engine})
                      </span>
                      {sqlResult.explanation && (
                        <p className="mt-0.5 text-[11px] text-slate-400">{sqlResult.explanation}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(
                          'duckdb_query_result.csv',
                          sqlResult.columns,
                          sqlResult.rows.map((r) => sqlResult.columns.map((c) => r[c] as string | number | null))
                        )
                      }
                      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                    >
                      <Download className="h-3 w-3" /> Export CSV
                    </button>
                  </div>
                  <div className="max-h-96 overflow-auto rounded border border-slate-800">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase text-slate-400">
                        <tr>
                          {sqlResult.columns.map((c) => (
                            <th key={c} className="px-2.5 py-2">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {sqlResult.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-800/40">
                            {sqlResult.columns.map((c) => (
                              <td key={c} className="px-2.5 py-1.5 text-slate-200">
                                {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Live DuckDB Schema Browser */}
            <div className="space-y-3 lg:col-span-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs">
                <h3 className="mb-3 flex items-center gap-1.5 font-semibold text-slate-100">
                  <Database className="h-4 w-4 text-emerald-400" />
                  Available DuckDB Tables
                </h3>
                <div className="space-y-3">
                  {Object.entries(schema?.tables || {}).map(([tbl, cols]) => (
                    <div key={tbl} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between font-mono">
                        <span className="font-semibold text-sky-300">{tbl}</span>
                        <span className="text-[10px] text-slate-500">
                          {(schema?.counts as Record<string, number> | undefined)?.[tbl] ?? 0} rows
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cols.map((col) => (
                          <span
                            key={col}
                            className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </CopilotNavShell>
  );
}
