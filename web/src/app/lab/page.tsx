'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CandlestickChart,
  Database,
  FlaskConical,
  Loader2,
  MessageSquare,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { CopilotNavShell } from '@/components/CopilotNavShell';
import { DataManager } from '@/components/DataManager';
import { copilotApi, type HypothesisDoc, type ProposalDoc } from '@/lib/copilotApi';
import { useCopilotStore } from '@/store/copilotStore';

// Latest 5-year (2022-2026) Live V5 Unified Stack 18-Pair Attribution & Jackknife Baseline
interface PairBench {
  symbol: string;
  cluster: string;
  n: number;
  wr: number;
  r08: number;
  r12: number;
  is08: number;
  oos08: number;
}

const V5_18_PAIR_BASELINE: PairBench[] = [
  { symbol: 'EURJPY', cluster: 'EUR Cross', n: 55, wr: 61.8, r08: 29.3, r12: 28.3, is08: 21.7, oos08: 7.5 },
  { symbol: 'US30', cluster: 'US Indices', n: 109, wr: 50.5, r08: 27.4, r12: 26.8, is08: 17.0, oos08: 10.5 },
  { symbol: 'USDJPY', cluster: 'USD Major', n: 44, wr: 61.4, r08: 20.3, r12: 19.5, is08: 16.7, oos08: 3.7 },
  { symbol: 'NAS100', cluster: 'US Indices', n: 117, wr: 47.0, r08: 19.0, r12: 18.0, is08: 5.2, oos08: 13.7 },
  { symbol: 'EURGBP', cluster: 'EUR Cross', n: 84, wr: 46.4, r08: 11.8, r12: 8.7, is08: -1.1, oos08: 13.0 },
  { symbol: 'US500', cluster: 'US Indices', n: 110, wr: 46.4, r08: 11.2, r12: 7.6, is08: 6.0, oos08: 5.1 },
  { symbol: 'EURCAD', cluster: 'EUR Cross', n: 86, wr: 47.7, r08: 10.2, r12: 8.0, is08: 8.8, oos08: 1.4 },
  { symbol: 'GBPCHF', cluster: 'GBP Cross', n: 23, wr: 56.5, r08: 7.1, r12: 6.6, is08: 5.1, oos08: 2.0 },
  { symbol: 'GBPCAD', cluster: 'GBP Cross', n: 85, wr: 43.5, r08: 3.5, r12: 1.8, is08: 0.8, oos08: 2.7 },
  { symbol: 'XAGUSD', cluster: 'Metals', n: 62, wr: 43.5, r08: 1.4, r12: -0.2, is08: -0.3, oos08: 1.7 },
  { symbol: 'GBPAUD', cluster: 'GBP Cross', n: 53, wr: 43.4, r08: 1.0, r12: 0.1, is08: 8.2, oos08: -7.2 },
  { symbol: 'EURUSD', cluster: 'USD Major', n: 70, wr: 41.4, r08: 0.6, r12: -1.5, is08: 5.1, oos08: -4.5 },
  { symbol: 'GBPNZD', cluster: 'GBP Cross', n: 57, wr: 42.1, r08: -2.4, r12: -3.2, is08: -2.6, oos08: 0.2 },
  { symbol: 'GBPUSD', cluster: 'USD Major', n: 61, wr: 41.0, r08: -2.6, r12: -4.0, is08: -5.9, oos08: 3.2 },
  { symbol: 'EURCHF', cluster: 'EUR Cross', n: 26, wr: 42.3, r08: -2.8, r12: -3.4, is08: 0.2, oos08: -3.0 },
  { symbol: 'AUDJPY', cluster: 'JPY Other', n: 59, wr: 39.0, r08: -5.1, r12: -6.5, is08: -3.0, oos08: -2.1 },
  { symbol: 'XAUUSD', cluster: 'Metals', n: 48, wr: 35.4, r08: -6.1, r12: -6.4, is08: -4.4, oos08: -1.7 },
  { symbol: 'USDCAD', cluster: 'USD Major', n: 98, wr: 40.8, r08: -6.7, r12: -9.7, is08: -3.7, oos08: -3.0 },
];

export default function QuantLabPage() {
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const [spread, setSpread] = useState<'0.8p' | '1.2p'>('0.8p');
  const [exclDrags, setExclDrags] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [hypotheses, setHypotheses] = useState<HypothesisDoc[]>([]);
  const [proposals, setProposals] = useState<ProposalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHypTitle, setNewHypTitle] = useState('');
  const [newHypLevel, setNewHypLevel] = useState(1);
  const [savingHyp, setSavingHyp] = useState(false);
  const [openProposalId, setOpenProposalId] = useState<string | null>(null);

  const loadLab = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, pRes] = await Promise.all([copilotApi.listHypotheses(), copilotApi.proposals()]);
      setHypotheses(hRes.hypotheses);
      setProposals(pRes.proposals);
    } catch {
      /* tolerate cold twin */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hRes, pRes] = await Promise.all([copilotApi.listHypotheses(), copilotApi.proposals()]);
        if (!cancelled) {
          setHypotheses(hRes.hypotheses);
          setProposals(pRes.proposals);
        }
      } catch {
        /* tolerate cold twin */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeRows = useMemo(
    () => (exclDrags ? V5_18_PAIR_BASELINE.filter((r) => !(r.is08 < 0 && r.oos08 < 0)) : V5_18_PAIR_BASELINE),
    [exclDrags]
  );

  const totals = useMemo(() => {
    const n = activeRows.reduce((a, r) => a + r.n, 0);
    const net = activeRows.reduce((a, r) => a + (spread === '0.8p' ? r.r08 : r.r12), 0);
    const isNet = activeRows.reduce((a, r) => a + r.is08, 0);
    const oosNet = activeRows.reduce((a, r) => a + r.oos08, 0);
    const pos = activeRows.filter((r) => (spread === '0.8p' ? r.r08 : r.r12) > 0).length;
    const best = activeRows.reduce((acc, r) => ((spread === '0.8p' ? r.r08 : r.r12) > (spread === '0.8p' ? acc.r08 : acc.r12) ? r : acc), activeRows[0]);
    const looExBest = net - (spread === '0.8p' ? best.r08 : best.r12);
    return { n, net, avg: n ? net / n : 0, isNet, oosNet, pos, totalSyms: activeRows.length, bestSym: best.symbol, looExBest };
  }, [activeRows, spread]);

  async function addHypothesis() {
    if (!newHypTitle.trim()) return;
    setSavingHyp(true);
    try {
      await copilotApi.createHypothesis({
        title: newHypTitle.trim(),
        target_level: newHypLevel,
      });
      setNewHypTitle('');
      toast.success('Hypothesis queued for separate-PR IS/OOS + Jackknife testing.');
      await loadLab();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create hypothesis');
    } finally {
      setSavingHyp(false);
    }
  }

  return (
    <CopilotNavShell
      title="Quant Lab & 18-Pair Jackknife Matrix"
      subtitle="Audit per-instrument health, add new instruments via OANDA/Dukascopy, queue Level 1–4 rule experiments, and inspect Stage-4 weekly proposals."
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-slate-800 bg-slate-900 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSpread('0.8p')}
              className={`rounded px-2.5 py-1 font-mono ${spread === '0.8p' ? 'bg-sky-600 text-white' : 'text-slate-400'}`}
            >
              0.8p Base
            </button>
            <button
              type="button"
              onClick={() => setSpread('1.2p')}
              className={`rounded px-2.5 py-1 font-mono ${spread === '1.2p' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
            >
              1.2p Stress
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDataOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
          >
            <Database className="h-3.5 w-3.5" />
            Add / Download Instrument
          </button>
        </div>
      }
    >
      {/* Top Jackknife KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">5-Yr Net R ({spread})</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
            {totals.net >= 0 ? `+${totals.net.toFixed(1)}R` : `${totals.net.toFixed(1)}R`}
          </div>
          <div className="text-[11px] text-slate-400">{totals.n} trades · {totals.avg >= 0 ? '+' : ''}{totals.avg.toFixed(3)}R/tr</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Strict IS (2022–2024)</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-100">+{totals.isNet.toFixed(1)}R</div>
          <div className="text-[11px] text-slate-400">3 full calendar years</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Blind OOS (2025–2026)</div>
          <div className="mt-1 font-mono text-xl font-bold text-sky-400">+{totals.oosNet.toFixed(1)}R</div>
          <div className="text-[11px] text-slate-400">Unseen forward split</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Instrument Breadth</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-100">
            {totals.pos}/{totals.totalSyms}
          </div>
          <div className="text-[11px] text-slate-400">Positive 5-yr symbols</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Jackknife (Ex-{totals.bestSym})</div>
          <div className="mt-1 font-mono text-xl font-bold text-emerald-300">+{totals.looExBest.toFixed(1)}R</div>
          <div className="text-[11px] text-slate-400">No single-pair fluke</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: 18-Pair V5 Attribution Table */}
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <TrendingUp className="h-4 w-4 text-sky-400" />
                  18-Pair Live V5 Attribution & Outlier Audit
                </h2>
                <p className="text-xs text-slate-400">
                  Flags pairs negative in both IS & Blind OOS (`USDCAD`, `XAUUSD`, `AUDJPY`) so single-instrument drags never hide broad edges.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/data?run=v5_18pair_baseline"
                  className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-600/15 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-600 hover:text-white"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Query &amp; Compare in Data Studio
                </Link>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={exclDrags}
                    onChange={(e) => setExclDrags(e.target.checked)}
                  />
                  Sandbox: Excl. 3 Both-Split Drags (15 pairs)
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-2">Symbol</th>
                    <th className="py-2 pr-2">Cluster</th>
                    <th className="py-2 pr-2 text-right">N</th>
                    <th className="py-2 pr-2 text-right">WR</th>
                    <th className="py-2 pr-2 text-right">IS (22–24)</th>
                    <th className="py-2 pr-2 text-right">OOS (25–26)</th>
                    <th className="py-2 pr-2 text-right">5-Yr ({spread})</th>
                    <th className="py-2 pr-2 text-right">Status</th>
                    <th className="py-2 text-right">Chart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {activeRows.map((r) => {
                    const net = spread === '0.8p' ? r.r08 : r.r12;
                    const bothPos = r.is08 > 0 && r.oos08 > 0;
                    const bothNeg = r.is08 < 0 && r.oos08 < 0;
                    return (
                      <tr key={r.symbol} className="hover:bg-slate-800/40">
                        <td className="py-2 pr-2 font-semibold text-slate-100">{r.symbol}</td>
                        <td className="py-2 pr-2 font-sans text-[11px] text-slate-400">{r.cluster}</td>
                        <td className="py-2 pr-2 text-right text-slate-300">{r.n}</td>
                        <td className="py-2 pr-2 text-right text-slate-300">{r.wr.toFixed(1)}%</td>
                        <td className={`py-2 pr-2 text-right ${r.is08 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {r.is08 >= 0 ? `+${r.is08.toFixed(1)}` : r.is08.toFixed(1)}R
                        </td>
                        <td className={`py-2 pr-2 text-right ${r.oos08 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {r.oos08 >= 0 ? `+${r.oos08.toFixed(1)}` : r.oos08.toFixed(1)}R
                        </td>
                        <td className={`py-2 pr-2 text-right font-semibold ${net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {net >= 0 ? `+${net.toFixed(1)}` : net.toFixed(1)}R
                        </td>
                        <td className="py-2 pr-2 text-right font-sans">
                          {bothPos ? (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">Both +</span>
                          ) : bothNeg ? (
                            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-300">Both − Drag</span>
                          ) : (
                            <span className="text-[10px] text-slate-500">Mixed</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-sans">
                          <Link
                            href={`/?backtest=v5_18pair_baseline&symbol=${encodeURIComponent(r.symbol)}`}
                            className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-600/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 hover:bg-sky-600 hover:text-white"
                          >
                            <CandlestickChart className="h-3 w-3" /> Inspect
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Hypothesis Promotion Queue + Weekly Stage-4 Proposals */}
        <div className="space-y-5 lg:col-span-5">
          {/* Hypothesis Test Queue */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <FlaskConical className="h-4 w-4 text-indigo-400" />
                Learning Promotion Test Queue
              </h2>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                {hypotheses.length} queued
              </span>
            </div>

            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={newHypTitle}
                onChange={(e) => setNewHypTitle(e.target.value)}
                placeholder="New rule/watchlist hypothesis to PR-test…"
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
              />
              <select
                value={newHypLevel}
                onChange={(e) => setNewHypLevel(Number(e.target.value))}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value={1}>L1 Visual</option>
                <option value={2}>L2 Throttle</option>
                <option value={3}>L3 Veto</option>
                <option value={4}>L4 V5</option>
              </select>
              <button
                type="button"
                disabled={savingHyp || !newHypTitle.trim()}
                onClick={() => void addHypothesis()}
                className="flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Queue
              </button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading queue…
              </div>
            ) : hypotheses.length === 0 ? (
              <div className="rounded border border-slate-800/80 bg-slate-950/50 p-3 text-xs text-slate-400">
                No queued promotion tests yet. Queue one above or from any Level-0 lesson in <code className="text-sky-300">/knowledge</code>.
              </div>
            ) : (
              <div className="space-y-2">
                {hypotheses.map((h) => (
                  <div key={h.hypothesis_id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">{h.title}</span>
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                        Target L{h.target_level}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{h.test_plan}</div>
                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="text-amber-300">{h.status}</span>
                      <button
                        type="button"
                        onClick={() =>
                          openDrawer({
                            context: { kind: 'hypothesis', label: h.title, summary: h.notes || h.test_plan },
                            prefill: `Design the exact 5-year IS/OOS + 18-pair Jackknife test for: ${h.title}`,
                          })
                        }
                        className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                      >
                        <MessageSquare className="h-3 w-3" /> Ask Co-Pilot
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weekly Stage-4 Quant Researcher Proposals */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              Stage-4 Weekly Quant Researcher Reports ({proposals.length})
            </h2>
            {proposals.length === 0 ? (
              <p className="text-xs text-slate-400">No weekly Stage-4 reports archived yet (runs Saturdays 14:00 UTC on `co-pilot-516023`).</p>
            ) : (
              <div className="space-y-2">
                {proposals.map((p) => {
                  const isOpen = openProposalId === p.proposal_id;
                  return (
                    <div key={p.proposal_id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setOpenProposalId(isOpen ? null : p.proposal_id)}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <div>
                          <div className="font-medium text-slate-100">{p.proposal_id}</div>
                          <div className="text-[11px] text-slate-400">
                            {p.timeframe} · Promoted {p.promoted_count ?? 0}/{p.tested_count ?? 0}
                          </div>
                        </div>
                        <span className="text-[11px] text-sky-300">{isOpen ? 'Hide' : 'Inspect'}</span>
                      </button>
                      {isOpen && p.markdown && (
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-900 p-2.5 font-sans text-[11px] leading-relaxed text-slate-200">
                          {p.markdown}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/20 bg-amber-950/20 p-2.5 text-[11px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              All rule or watchlist changes require a dedicated GitHub PR passing IS (2022–2024) + Blind OOS (2025–2026), 0.8p & 1.2p spread, Challenge/Funded, and Jackknife breadth before merge.
            </div>
          </div>
        </div>
      </div>

      {dataOpen && <DataManager onClose={() => setDataOpen(false)} />}
    </CopilotNavShell>
  );
}
