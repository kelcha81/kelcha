'use client';

import { useState, type ReactNode } from 'react';
import { Plus, Play, Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTradingStore, DEFAULT_ACCOUNT } from '@/store/tradingStore';
import { computeStats } from '@/lib/performance';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { confirm } from '@/components/ui/confirm';

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
export function HomeDashboard() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const openSession = useWorkspaceStore((s) => s.openSession);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const allTrades = useTradingStore((s) => s.trades);
  const accounts = useTradingStore((s) => s.accounts);
  const [newOpen, setNewOpen] = useState(false);

  const sessions = tabs.map((t) => {
    const trades = allTrades[t.id] ?? [];
    const stats = computeStats(trades, (accounts[t.id] ?? DEFAULT_ACCOUNT).balance);
    const wins = trades.filter((x) => x.pnl > 0).length;
    return { tab: t, trades, stats, wins };
  });

  const totalPnl = sessions.reduce((a, s) => a + s.stats.totalPnl, 0);
  const totalTrades = sessions.reduce((a, s) => a + s.stats.trades, 0);
  const totalWins = sessions.reduce((a, s) => a + s.wins, 0);
  const winRate = totalTrades ? (totalWins / totalTrades) * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Backtesting Dashboard</h1>
          <p className="text-sm text-slate-400">Your replay sessions and performance.</p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" /> New session
        </button>
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
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {cell('P&L', money(stats.totalPnl), `font-mono ${col(stats.totalPnl)}`)}
                {cell('Trades', String(stats.trades), 'font-mono')}
                {cell('Win', `${(stats.winRate * 100).toFixed(0)}%`, 'font-mono')}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">Head at {fmtDate(tab.savedHead)}</div>
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
