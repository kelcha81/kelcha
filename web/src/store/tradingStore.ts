import { create } from 'zustand';
import { settleBars } from '@/lib/fills';
import type { Candle } from '@/store/replayStore';

export type Side = 'long' | 'short';

export interface Position {
  id: string;
  side: Side;
  size: number; // lots
  contractSize: number; // units per lot (for account-currency P&L)
  entryPrice: number;
  entryTime: number;
  sl?: number;
  tp?: number;
}

export interface PendingOrder {
  id: string;
  side: Side;
  size: number;
  contractSize: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
  createdTime: number;
}

export interface Trade {
  id: string;
  side: Side;
  size: number;
  contractSize: number;
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  pnl: number; // account currency, net of costs
  risk?: number; // account currency risked (|entry-sl| × contractSize × size), if an SL was set
  reason: 'manual' | 'sl' | 'tp';
  note?: string;
  tags?: string;
}

/** Per-session account settings. */
export interface Account {
  balance: number; // starting capital (account currency)
  spread: number; // price units, charged once per round-trip
  commission: number; // per lot, per side
}

export const DEFAULT_ACCOUNT: Account = { balance: 10000, spread: 0, commission: 0 };

/** Gross P&L in account currency: price move × contract size × lots. */
export function tradePnl(side: Side, entry: number, exit: number, size: number, contractSize: number): number {
  return (side === 'long' ? exit - entry : entry - exit) * contractSize * size;
}

function costs(p: { size: number; contractSize: number }, acc: Account): number {
  return acc.commission * p.size * 2 + acc.spread * p.contractSize * p.size;
}

interface TradingState {
  positions: Record<string, Position[]>;
  pending: Record<string, PendingOrder[]>;
  trades: Record<string, Trade[]>;
  accounts: Record<string, Account>;
  open: (tabId: string, p: Omit<Position, 'id'>) => void;
  placePending: (tabId: string, o: Omit<PendingOrder, 'id'>) => void;
  cancelPending: (tabId: string, id: string) => void;
  fillPending: (tabId: string, id: string, fillTime: number) => void;
  close: (tabId: string, posId: string, exitPrice: number, exitTime: number, reason?: Trade['reason']) => void;
  closeAll: (tabId: string, exitPrice: number, exitTime: number) => void;
  /** Replay-driven settlement: fill limits + SL/TP across every m1 bar stepped over. */
  settle: (tabId: string, bars: Candle[]) => void;
  setAccount: (tabId: string, patch: Partial<Account>) => void;
  annotate: (tabId: string, tradeId: string, patch: { note?: string; tags?: string }) => void;
  clear: (tabId: string) => void;
  /** Wipe everything (on sign-out / account switch). */
  reset: () => void;
}

let counter = 0;
const nextId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

function toTrade(p: Position, exitPrice: number, exitTime: number, reason: Trade['reason'], acc: Account): Trade {
  const gross = tradePnl(p.side, p.entryPrice, exitPrice, p.size, p.contractSize);
  return {
    id: p.id,
    side: p.side,
    size: p.size,
    contractSize: p.contractSize,
    entryPrice: p.entryPrice,
    entryTime: p.entryTime,
    exitPrice,
    exitTime,
    pnl: gross - costs(p, acc),
    risk: p.sl != null ? Math.abs(p.entryPrice - p.sl) * p.contractSize * p.size : undefined,
    reason
  };
}

// In-memory; the per-user copy lives in Firestore (see WorkspaceSync). No
// localStorage persist — that would leak one account's trades to another on the
// same browser.
export const useTradingStore = create<TradingState>((set) => ({
      positions: {},
      pending: {},
      trades: {},
      accounts: {},

      open: (tabId, p) =>
        set((s) => ({
          positions: { ...s.positions, [tabId]: [...(s.positions[tabId] ?? []), { ...p, id: nextId() }] }
        })),

      placePending: (tabId, o) =>
        set((s) => ({
          pending: { ...s.pending, [tabId]: [...(s.pending[tabId] ?? []), { ...o, id: nextId() }] }
        })),

      cancelPending: (tabId, id) =>
        set((s) => ({
          pending: { ...s.pending, [tabId]: (s.pending[tabId] ?? []).filter((o) => o.id !== id) }
        })),

      fillPending: (tabId, id, fillTime) =>
        set((s) => {
          const list = s.pending[tabId] ?? [];
          const o = list.find((x) => x.id === id);
          if (!o) return s;
          const pos: Position = {
            id: nextId(),
            side: o.side,
            size: o.size,
            contractSize: o.contractSize,
            entryPrice: o.entryPrice,
            entryTime: fillTime,
            sl: o.sl,
            tp: o.tp
          };
          return {
            pending: { ...s.pending, [tabId]: list.filter((x) => x.id !== id) },
            positions: { ...s.positions, [tabId]: [...(s.positions[tabId] ?? []), pos] }
          };
        }),

      close: (tabId, posId, exitPrice, exitTime, reason = 'manual') =>
        set((s) => {
          const list = s.positions[tabId] ?? [];
          const pos = list.find((p) => p.id === posId);
          if (!pos) return s;
          const acc = s.accounts[tabId] ?? DEFAULT_ACCOUNT;
          return {
            positions: { ...s.positions, [tabId]: list.filter((p) => p.id !== posId) },
            trades: { ...s.trades, [tabId]: [...(s.trades[tabId] ?? []), toTrade(pos, exitPrice, exitTime, reason, acc)] }
          };
        }),

      closeAll: (tabId, exitPrice, exitTime) =>
        set((s) => {
          const list = s.positions[tabId] ?? [];
          if (list.length === 0) return s;
          const acc = s.accounts[tabId] ?? DEFAULT_ACCOUNT;
          const closed = list.map((p) => toTrade(p, exitPrice, exitTime, 'manual', acc));
          return {
            positions: { ...s.positions, [tabId]: [] },
            trades: { ...s.trades, [tabId]: [...(s.trades[tabId] ?? []), ...closed] }
          };
        }),

      settle: (tabId, bars) =>
        set((s) => {
          if (!bars.length) return s;
          const positions = s.positions[tabId] ?? [];
          const pending = s.pending[tabId] ?? [];
          if (!positions.length && !pending.length) return s;
          const acc = s.accounts[tabId] ?? DEFAULT_ACCOUNT;
          const r = settleBars(positions, pending, bars, nextId);
          if (!r.fills.length && !r.closures.length) return s;
          const closed = r.closures.map((c) => toTrade(c.position, c.price, c.time, c.reason, acc));
          return {
            positions: { ...s.positions, [tabId]: r.positions },
            pending: { ...s.pending, [tabId]: r.pending },
            trades: { ...s.trades, [tabId]: [...(s.trades[tabId] ?? []), ...closed] }
          };
        }),

      setAccount: (tabId, patch) =>
        set((s) => ({
          accounts: { ...s.accounts, [tabId]: { ...(s.accounts[tabId] ?? DEFAULT_ACCOUNT), ...patch } }
        })),

      annotate: (tabId, tradeId, patch) =>
        set((s) => ({
          trades: { ...s.trades, [tabId]: (s.trades[tabId] ?? []).map((t) => (t.id === tradeId ? { ...t, ...patch } : t)) }
        })),

      clear: (tabId) =>
        set((s) => ({
          positions: { ...s.positions, [tabId]: [] },
          pending: { ...s.pending, [tabId]: [] },
          trades: { ...s.trades, [tabId]: [] }
        })),

      reset: () => set({ positions: {}, pending: {}, trades: {}, accounts: {} })
    })
);
