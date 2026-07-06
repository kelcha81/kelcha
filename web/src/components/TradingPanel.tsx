'use client';

import { useEffect, useRef, useState } from 'react';
import { Crosshair, Settings } from 'lucide-react';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { useVisibleData } from '@/hooks/useVisibleData';
import { getRange } from '@/lib/candleSource';
import {
  useTradingStore,
  tradePnl,
  DEFAULT_ACCOUNT,
  type Position,
  type PendingOrder,
  type Trade
} from '@/store/tradingStore';
import { useOrderToolStore, type OrderField } from '@/store/orderToolStore';
import { classifyEntry } from '@/lib/fills';
import { exportTradesCSV, exportTradesJSON } from '@/lib/exportTrades';
import { getSymbolInfo } from '@/lib/symbols';
import { PerformanceReport } from '@/components/PerformanceReport';
import { BacktestResults } from '@/components/BacktestResults';
import { confirm } from '@/components/ui/confirm';

const EMPTY_POS: Position[] = [];
const EMPTY_PENDING: PendingOrder[] = [];
const EMPTY_TRADES: Trade[] = [];

/**
 * Inline price-level editor for an open position / resting order. Uncontrolled
 * (keyed on `value`) so an external change — e.g. dragging the level on the
 * chart in C2 — remounts it with the fresh value, with no prop→state effect.
 * Commits on blur / Enter; empty commits `null` (clears the level, SL/TP only).
 */
function LevelEdit({
  label,
  value,
  color,
  allowClear = true,
  onCommit
}: {
  label: string;
  value?: number;
  color: string;
  allowClear?: boolean;
  onCommit: (v: number | null) => void;
}) {
  const commit = (el: HTMLInputElement) => {
    const t = el.value.trim();
    if (t === '') {
      if (allowClear) onCommit(null);
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) onCommit(n);
  };
  return (
    <label className="flex items-center gap-0.5">
      <span className="text-[9px] font-semibold uppercase" style={{ color }}>
        {label}
      </span>
      <input
        key={value ?? 'empty'}
        defaultValue={value != null ? String(value) : ''}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="—"
        inputMode="decimal"
        className="w-16 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-[10px] text-slate-100"
      />
    </label>
  );
}

export function TradingPanel() {
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const { symbol } = useActiveTab();
  const info = getSymbolInfo(symbol);
  const precision = info.pricePrecision;
  const contractSize = info.contractSize;
  const head = useReplayStore((s) => s.currentTimestamp);

  const candles = useVisibleData('m1');
  const bar = candles.length ? candles[candles.length - 1] : null;
  const price = bar?.close ?? null;

  const positions = useTradingStore((s) => s.positions[activeTabId] ?? EMPTY_POS);
  const pending = useTradingStore((s) => s.pending[activeTabId] ?? EMPTY_PENDING);
  const trades = useTradingStore((s) => s.trades[activeTabId] ?? EMPTY_TRADES);
  const account = useTradingStore((s) => s.accounts[activeTabId] ?? DEFAULT_ACCOUNT);
  const openPos = useTradingStore((s) => s.open);
  const placePending = useTradingStore((s) => s.placePending);
  const cancelPending = useTradingStore((s) => s.cancelPending);
  const close = useTradingStore((s) => s.close);
  const closeAll = useTradingStore((s) => s.closeAll);
  const modify = useTradingStore((s) => s.modify);
  const modifyPending = useTradingStore((s) => s.modifyPending);
  const reverse = useTradingStore((s) => s.reverse);
  const setAccount = useTradingStore((s) => s.setAccount);
  const clear = useTradingStore((s) => s.clear);

  const entry = useOrderToolStore((s) => s.entry);
  const sl = useOrderToolStore((s) => s.sl);
  const tp = useOrderToolStore((s) => s.tp);
  const pick = useOrderToolStore((s) => s.pick);
  const setPick = useOrderToolStore((s) => s.setPick);
  const setValue = useOrderToolStore((s) => s.setValue);
  const clearField = useOrderToolStore((s) => s.clearField);
  const resetOrder = useOrderToolStore((s) => s.reset);
  const projecting = useOrderToolStore((s) => s.projecting);
  const orderSide = useOrderToolStore((s) => s.side);
  const cancelOrder = useOrderToolStore((s) => s.cancel);

  const size = useOrderToolStore((s) => s.lots);
  const setLots = useOrderToolStore((s) => s.setLots);
  const [riskPct, setRiskPct] = useState('');
  const [showAccount, setShowAccount] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Settlement: whenever the head moves FORWARD, walk every m1 bar in
  // (prevHead, head] through the pure fill engine (lib/fills.ts) so limit fills
  // and SL/TP exits are honored across jumps (fast speeds, day jumps, seeks).
  // Tab switches and backward seeks just re-anchor without settling.
  const prevRef = useRef<{ tabId: string; head: number } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { tabId: activeTabId, head };
    if (!prev || prev.tabId !== activeTabId || head <= prev.head) return;
    let cancelled = false;
    getRange(symbol, 'm1', prev.head + 1, head)
      .then((bars) => {
        if (!cancelled && bars.length) useTradingStore.getState().settle(activeTabId, bars);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [head, activeTabId, symbol]);

  // Risk-% sizing: lots so that hitting SL loses `risk%` of balance.
  const applyRisk = (value: string) => {
    setRiskPct(value);
    const pct = Number(value);
    const ref = entry ?? price;
    if (pct > 0 && sl != null && ref != null) {
      const dist = Math.abs(ref - sl);
      if (dist > 0) setLots(Number(((account.balance * pct) / 100 / (dist * contractSize)).toFixed(2)));
    }
  };

  // Classify a set entry vs the live price: buy-below / sell-above = limit,
  // the other side = stop. No entry = market. Drives the button label + fill kind.
  const orderType: 'market' | 'limit' | 'stop' =
    entry == null ? 'market' : price != null ? classifyEntry(orderSide, entry, price) : 'limit';

  const placeOrder = (side: 'long' | 'short') => {
    if (size <= 0) return;
    const common = { side, size, contractSize, sl: sl ?? undefined, tp: tp ?? undefined };
    if (entry != null) {
      const kind = price != null ? classifyEntry(side, entry, price) : 'limit';
      placePending(activeTabId, { ...common, entryPrice: entry, createdTime: head, kind });
    } else if (price != null) {
      openPos(activeTabId, { ...common, entryPrice: price, entryTime: head });
    }
    resetOrder();
  };

  const fmtPrice = (n: number) => n.toFixed(precision);
  const money = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);
  const pnlColor = (n: number) => (n > 0 ? 'text-green-400' : n < 0 ? 'text-red-400' : 'text-slate-400');

  const realized = trades.reduce((a, t) => a + t.pnl, 0);
  const unrealized =
    price == null ? 0 : positions.reduce((a, p) => a + tradePnl(p.side, p.entryPrice, price, p.size, p.contractSize), 0);
  const equity = account.balance + realized + unrealized;

  const levelInput = (field: OrderField, value: number | null) => (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="any"
        placeholder={field === 'entry' ? 'market' : '—'}
        value={value ?? ''}
        onChange={(e) => (e.target.value === '' ? clearField(field) : setValue(field, Number(e.target.value)))}
        className="w-16 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-right text-xs text-slate-100"
      />
      <button
        type="button"
        title={`Pick ${field} from chart`}
        onClick={() => setPick(field)}
        className={`flex h-6 w-6 items-center justify-center rounded ${
          pick === field ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
        }`}
      >
        <Crosshair className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-3 overflow-y-auto border-l border-slate-800 bg-slate-950/60 p-3 text-slate-200">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">Paper Trading</div>
        <div className="font-mono text-sm tabular-nums">{price == null ? '—' : fmtPrice(price)}</div>
      </div>

      {/* Account */}
      <div className="rounded-lg border border-slate-800 p-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Balance</span>
          <span className="flex items-center gap-1 font-mono tabular-nums">
            {account.balance.toFixed(2)}
            <button type="button" onClick={() => setShowAccount((v) => !v)} title="Account settings" className="text-slate-400 hover:text-white">
              <Settings className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Equity</span>
          <span className={`font-mono tabular-nums ${pnlColor(equity - account.balance)}`}>{equity.toFixed(2)}</span>
        </div>
        {showAccount && (
          <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
            {(
              [
                ['balance', 'Balance'],
                ['spread', 'Spread (px)'],
                ['commission', 'Comm/lot']
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                {label}
                <input
                  type="number"
                  step="any"
                  value={account[key]}
                  onChange={(e) => setAccount(activeTabId, { [key]: Number(e.target.value) })}
                  className="w-24 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-right text-xs text-slate-100"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Order ticket */}
      <div className="space-y-2 rounded-lg border border-slate-800 p-2">
        {pick && <div className="rounded bg-blue-600/20 px-2 py-1 text-[11px] text-blue-300">Click the chart to set {pick.toUpperCase()}</div>}
        <div className="flex gap-2">
          <label className="flex flex-1 items-center justify-between gap-1 text-xs text-slate-400">
            Lots
            <input
              type="number"
              min={0}
              step="any"
              value={size}
              onChange={(e) => setLots(Number(e.target.value))}
              className="w-16 rounded border border-slate-700 bg-slate-800 px-1 py-1 text-right text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-1 items-center justify-between gap-1 text-xs text-slate-400">
            Risk %
            <input
              type="number"
              step="any"
              value={riskPct}
              placeholder="—"
              onChange={(e) => applyRisk(e.target.value)}
              className="w-14 rounded border border-slate-700 bg-slate-800 px-1 py-1 text-right text-xs text-slate-100"
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          Entry {levelInput('entry', entry)}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          SL {levelInput('sl', sl)}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          TP {levelInput('tp', tp)}
        </div>
        {projecting && (
          <div className="rounded border border-blue-800 bg-blue-950/40 p-2">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-blue-300">Order projection</span>
              <span className="uppercase text-slate-400">{orderType}</span>
            </div>
            <div className="mb-2 text-[11px] text-slate-400">Drag the box on the chart to adjust entry / SL / TP, then place.</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => placeOrder(orderSide)}
                className={`flex-1 rounded py-1.5 text-sm font-medium text-white ${orderSide === 'long' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}
              >
                Place {orderSide === 'long' ? 'Buy' : 'Sell'} {orderType}
              </button>
              <button
                type="button"
                onClick={() => cancelOrder()}
                className="rounded border border-slate-700 bg-slate-800 px-3 text-sm text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={price == null && entry == null}
            onClick={() => placeOrder('long')}
            className="flex-1 rounded bg-green-600 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-40"
          >
            Buy {entry != null ? orderType : ''}
          </button>
          <button
            type="button"
            disabled={price == null && entry == null}
            onClick={() => placeOrder('short')}
            className="flex-1 rounded bg-red-600 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40"
          >
            Sell {entry != null ? orderType : ''}
          </button>
        </div>
      </div>

      {/* Pending orders */}
      {pending.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-400">Pending ({pending.length})</div>
          {pending.map((o) => (
            <div key={o.id} className="rounded border border-purple-900/60 px-2 py-1 text-xs">
              <div className="flex items-center justify-between">
                <span className={o.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                  {o.side === 'long' ? 'BUY' : 'SELL'} {o.size}
                </span>
                <span className="font-mono tabular-nums text-purple-300">@{fmtPrice(o.entryPrice)}</span>
                <button type="button" onClick={() => cancelPending(activeTabId, o.id)} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700">
                  ✕
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <LevelEdit label="Entry" value={o.entryPrice} color="#c4b5fd" allowClear={false} onCommit={(v) => v != null && modifyPending(activeTabId, o.id, { entryPrice: v })} />
                <LevelEdit label="SL" value={o.sl} color="#f87171" onCommit={(v) => modifyPending(activeTabId, o.id, { sl: v })} />
                <LevelEdit label="TP" value={o.tp} color="#4ade80" onCommit={(v) => modifyPending(activeTabId, o.id, { tp: v })} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Open positions */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Open ({positions.length})</span>
          {positions.length > 0 && price != null && (
            <button type="button" onClick={() => closeAll(activeTabId, price, head)} className="text-slate-300 hover:text-white">
              Close all
            </button>
          )}
        </div>
        {positions.map((p) => {
          const upnl = price == null ? 0 : tradePnl(p.side, p.entryPrice, price, p.size, p.contractSize);
          return (
            <div key={p.id} className="rounded border border-slate-800 px-2 py-1 text-xs">
              <div className="flex items-center justify-between">
                <span className={p.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                  {p.side === 'long' ? 'LONG' : 'SHORT'} {p.size}
                </span>
                <span className="font-mono tabular-nums text-slate-400">@{fmtPrice(p.entryPrice)}</span>
                <span className={`font-mono tabular-nums ${pnlColor(upnl)}`}>{money(upnl)}</span>
                <button
                  type="button"
                  disabled={price == null}
                  title="Close position"
                  onClick={() => price != null && close(activeTabId, p.id, price, head)}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <LevelEdit label="SL" value={p.sl} color="#f87171" onCommit={(v) => modify(activeTabId, p.id, { sl: v })} />
                <LevelEdit label="TP" value={p.tp} color="#4ade80" onCommit={(v) => modify(activeTabId, p.id, { tp: v })} />
                <button
                  type="button"
                  disabled={price == null || p.size <= 0}
                  title="Close half"
                  onClick={() => price != null && close(activeTabId, p.id, price, head, 'manual', p.size / 2)}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                >
                  ½
                </button>
                <button
                  type="button"
                  disabled={price == null}
                  title="Reverse (close and flip side)"
                  onClick={() => price != null && reverse(activeTabId, p.id, price, head)}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                >
                  Rev
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* P&L summary */}
      <div className="rounded-lg border border-slate-800 p-2 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Unrealized</span>
          <span className={`font-mono tabular-nums ${pnlColor(unrealized)}`}>{money(unrealized)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Realized</span>
          <span className={`font-mono tabular-nums ${pnlColor(realized)}`}>{money(realized)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-slate-800 pt-1 font-semibold">
          <span>Total</span>
          <span className={`font-mono tabular-nums ${pnlColor(realized + unrealized)}`}>{money(realized + unrealized)}</span>
        </div>
      </div>

      {/* Blotter */}
      <div className="min-h-0 flex-1">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
          <span>History ({trades.length})</span>
          {trades.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Clear trade history?',
                    body: `Deletes all ${trades.length} closed trades for this session.`,
                    danger: true,
                    confirmLabel: 'Clear'
                  })
                )
                  clear(activeTabId);
              }}
              className="hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {trades
            .slice()
            .reverse()
            .map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded px-1 py-0.5 text-[11px] hover:bg-slate-800/40">
                <span className={t.side === 'long' ? 'text-green-400' : 'text-red-400'}>
                  {t.side === 'long' ? 'L' : 'S'} {t.size}
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {fmtPrice(t.entryPrice)}→{fmtPrice(t.exitPrice)}
                </span>
                <span className="text-slate-600">{t.reason}</span>
                <span className={`font-mono tabular-nums ${pnlColor(t.pnl)}`}>{money(t.pnl)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Report */}
      <button
        type="button"
        disabled={trades.length === 0}
        onClick={() => setShowReport(true)}
        className="rounded bg-slate-800 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-40"
      >
        Performance report
      </button>

      {/* Export */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={trades.length === 0}
          onClick={() => exportTradesCSV(symbol, trades)}
          className="flex-1 rounded border border-slate-700 bg-slate-800 py-1 text-xs hover:bg-slate-700 disabled:opacity-40"
        >
          Export CSV
        </button>
        <button
          type="button"
          disabled={trades.length === 0}
          onClick={() => exportTradesJSON(symbol, trades)}
          className="flex-1 rounded border border-slate-700 bg-slate-800 py-1 text-xs hover:bg-slate-700 disabled:opacity-40"
        >
          Export JSON
        </button>
      </div>

      {/* Persistent backtest result for this tab (kept until the next run). */}
      <BacktestResults />

      {showReport && <PerformanceReport onClose={() => setShowReport(false)} />}
    </div>
  );
}
