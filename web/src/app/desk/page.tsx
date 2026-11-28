'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CandlestickChart,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Radio,
  RefreshCw,
  Sun,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { CopilotNavShell } from '@/components/CopilotNavShell';
import { copilotApi, type DeskSnapshot, type LiveSignalDoc } from '@/lib/copilotApi';
import { useCopilotStore } from '@/store/copilotStore';

export default function LiveDeskPage() {
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const [snap, setSnap] = useState<DeskSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await copilotApi.signals();
      setSnap(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load Live Desk');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await copilotApi.signals();
        if (!cancelled) {
          setSnap(res);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Failed to load Live Desk');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSignalAction(sig: LiveSignalDoc, action: 'took' | 'skip' | 'win' | 'loss') {
    setActionBusy(`${sig.signal_id}:${action}`);
    try {
      const res = await copilotApi.signalAction(sig.signal_id, action);
      toast.success(`Logged "${action.toUpperCase()}" for ${sig.symbol} — ASR draft ${res.draft_id || 'staged'}!`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionBusy(null);
    }
  }

  const dq = (snap?.dual_equity || {}) as Record<string, number | string>;
  const latestForecast = snap?.forecasts?.[0];

  return (
    <CopilotNavShell
      title="Live Trading Desk & Stage-3 Dual Equity"
      subtitle="Morning Pre-London / Pre-NY Forecasts, live Ready-to-Trade signals, execution logging (auto-stages Obsidian ASR drafts), and Co-Pilot drift tracking."
      actions={
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {err && (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
          {err}
        </div>
      )}

      {/* Top Desk KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Account Sizing Mode</div>
          <div className="mt-1 font-mono text-lg font-bold uppercase text-sky-300">
            {snap?.account_mode || 'challenge'}
          </div>
          <div className="text-[11px] text-slate-400">
            {snap?.account_mode === 'funded' ? '0.60% / 0.50% / 0.25%' : '0.75% / 0.50% / 0.40%'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Active Constitution</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-100">
            {snap?.playbook_version || 'v2.2'}
          </div>
          <div className="text-[11px] text-slate-400">
            Stream B Shadow: {snap?.stream_b_shadow ? 'ON (Silent)' : 'OFF'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Live Signals Logged</div>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-400">
            {snap?.signals.length ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">
            Armed Limit Orders: {snap?.armed_orders.length ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
          <div className="text-[10px] uppercase text-slate-500">Stage-3 Approved R</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-100">
            {typeof dq.approved_net_r === 'number'
              ? `${dq.approved_net_r >= 0 ? '+' : ''}${dq.approved_net_r.toFixed(2)}R`
              : '0.00R'}
          </div>
          <div className="text-[11px] text-slate-400">
            Graded: {String(dq.graded_count ?? 0)} (Level 5 needs ≥30)
          </div>
        </div>
      </div>

      {/* IG Lightstreamer Shadow Feed Health Banner */}
      {snap?.ig_shadow && (
        <div
          className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-xs ${
            snap.ig_shadow.status === 'ONLINE'
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
              : snap.ig_shadow.status === 'STALE'
                ? 'border-amber-500/40 bg-amber-950/25 text-amber-200'
                : 'border-rose-500/40 bg-rose-950/25 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="font-semibold">
              IG UK Spread Bet Shadow Feed: {snap.ig_shadow.status}
            </span>
            <span className="font-mono text-[11px] opacity-80">
              ({snap.ig_shadow.verified_epics}/{snap.ig_shadow.total_epics} EPICs · {snap.ig_shadow.closed_m1_total} M1 bars)
            </span>
          </div>
          <span className="font-mono text-[11px] opacity-80">
            {snap.ig_shadow.last_flush_at
              ? `Last heartbeat: ${snap.ig_shadow.last_flush_at}`
              : 'Waiting for first heartbeat'}
          </span>
        </div>
      )}

      {loading && !snap ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-sky-400" /> Loading Live Desk…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Latest Morning Forecast */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Sun className="h-4 w-4 text-amber-400" />
                  Latest Morning Forecast
                </h2>
                {latestForecast && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {latestForecast.session} · {latestForecast.trade_id}
                  </span>
                )}
              </div>

              {!latestForecast?.forecast ? (
                <p className="text-xs text-slate-400">No Morning Forecasts logged yet.</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {latestForecast.forecast.macro_summary && (
                    <p className="rounded-lg bg-slate-950/70 p-3 leading-relaxed text-slate-200">
                      {latestForecast.forecast.macro_summary}
                    </p>
                  )}

                  <div className="space-y-2.5">
                    {(latestForecast.forecast.watchlist_ideas || []).map((idea, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-mono text-sm font-semibold text-sky-300">{idea.pair}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-200">
                              {idea.bias}
                            </span>
                            <Link
                              href={`/?forecast=${encodeURIComponent(latestForecast.forecast_id)}&pair=${encodeURIComponent(idea.pair)}`}
                              className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-600/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 hover:bg-sky-600 hover:text-white"
                            >
                              <CandlestickChart className="h-3 w-3" /> Chart
                            </Link>
                          </div>
                        </div>
                        {idea.narrative && <p className="mb-1.5 text-slate-300">{idea.narrative}</p>}
                        <div className="space-y-0.5 text-[11px] text-slate-400">
                          {idea.pa_reaction_zone && <div>• <strong className="text-slate-300">Zone:</strong> {idea.pa_reaction_zone}</div>}
                          {idea.pa_where_to_fill && <div>• <strong className="text-slate-300">DOL:</strong> {idea.pa_where_to_fill}</div>}
                          {idea.trigger_to_watch && <div>• <strong className="text-emerald-300">Trigger:</strong> {idea.trigger_to_watch}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {latestForecast.forecast.avoid_today && latestForecast.forecast.avoid_today.length > 0 && (
                    <div className="rounded border border-rose-500/20 bg-rose-950/20 p-2.5 text-[11px] text-rose-200">
                      <div className="mb-1 font-semibold">Avoid Today:</div>
                      {latestForecast.forecast.avoid_today.map((a, i) => (
                        <div key={i}>• {a}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Live Signals & Execution Log */}
          <div className="lg:col-span-7">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Radio className="h-4 w-4 text-emerald-400" />
                  Live Radar Signals ({snap?.signals.length ?? 0})
                </h2>
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Activity className="h-3.5 w-3.5 text-sky-400" /> Clicking Took/Win/Loss auto-stages Obsidian ASR drafts
                </span>
              </div>

              {!snap?.signals.length ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-8 text-center text-xs text-slate-400">
                  No live radar signals recorded yet. Signals will stream here automatically during London & NY Killzones.
                </div>
              ) : (
                <div className="space-y-3">
                  {snap.signals.map((sig) => {
                    const isTake = sig.verdict?.includes('TAKE');
                    return (
                      <div key={sig.signal_id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-slate-100">
                              {sig.symbol} ({sig.tf})
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
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isTake
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {sig.verdict} · Grade {sig.grade || '?'}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-500">
                            {sig.trade_id || sig.signal_id.slice(0, 10)} · {sig.date}
                          </span>
                        </div>

                        {sig.telemetry?.entry && (
                          <div className="mb-2 flex flex-wrap gap-3 font-mono text-[11px] text-slate-300">
                            <span>Entry: {sig.telemetry.entry}</span>
                            <span>SL: {sig.telemetry.sl}</span>
                            <span>TP: {sig.telemetry.tp}</span>
                            {sig.telemetry.rr && <span>RR: {sig.telemetry.rr}R</span>}
                          </div>
                        )}

                        {sig.review?.actionable_plan && (
                          <p className="mb-2.5 text-slate-300">{sig.review.actionable_plan}</p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(['took', 'skip', 'win', 'loss'] as const).map((act) => {
                              const active = sig.user_action === act;
                              const busy = actionBusy === `${sig.signal_id}:${act}`;
                              return (
                                <button
                                  key={act}
                                  type="button"
                                  disabled={Boolean(actionBusy)}
                                  onClick={() => void onSignalAction(sig, act)}
                                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium capitalize transition ${
                                    active
                                      ? 'bg-sky-600 text-white'
                                      : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : act === 'win' || act === 'took' ? (
                                    <CheckCircle2 className="h-3 w-3" />
                                  ) : (
                                    <XCircle className="h-3 w-3" />
                                  )}
                                  {act}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-3">
                            <Link
                              href={`/?radar=${encodeURIComponent(sig.signal_id)}`}
                              className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-600/15 px-2 py-1 text-[11px] font-medium text-sky-300 hover:bg-sky-600 hover:text-white"
                            >
                              <CandlestickChart className="h-3 w-3" /> View on Chart
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                openDrawer({
                                  context: {
                                    kind: 'live_signal',
                                    label: `${sig.symbol} ${sig.direction} (${sig.trade_id || sig.date})`,
                                    symbol: sig.symbol,
                                    timeframe: sig.tf,
                                    tradeId: sig.trade_id || sig.signal_id,
                                    summary: sig.review?.actionable_plan,
                                  },
                                  prefill: `Walk me through why Co-Pilot graded ${sig.symbol} ${sig.direction} as ${sig.verdict}.`,
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:underline"
                            >
                              <MessageSquare className="h-3 w-3" /> Ask Co-Pilot
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </CopilotNavShell>
  );
}
