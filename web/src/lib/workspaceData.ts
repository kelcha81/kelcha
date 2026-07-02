import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firestore';
import type { Tab } from '@/store/workspaceStore';
import type { Position, PendingOrder, Trade, Account } from '@/store/tradingStore';
import type { BacktestResultData } from '@/store/backtestStore';

// Per-user workspace so a login carries its tabs + paper trades + saved backtests
// across devices. Owner-only by Firestore rules. Trading + tabs live in one small
// doc; backtests are per-tab docs (annotations dropped to stay under Firestore's
// 1MB limit — they re-derive on the next run).

export interface TradingData {
  positions: Record<string, Position[]>;
  pending: Record<string, PendingOrder[]>;
  trades: Record<string, Trade[]>;
  accounts: Record<string, Account>;
}

export interface WorkspaceData {
  tabs: Tab[];
  activeTabId: string;
  trading: TradingData;
}

// Firestore rejects `undefined`; a JSON round-trip drops undefined props and
// coerces to plain objects.
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const wsRef = (uid: string) => doc(db(), 'users', uid, 'private', 'workspace');
const btRef = (uid: string, tabId: string) => doc(db(), 'users', uid, 'backtests', tabId);

export async function loadWorkspace(uid: string): Promise<WorkspaceData | null> {
  const snap = await getDoc(wsRef(uid));
  return snap.exists() ? (snap.data() as WorkspaceData) : null;
}

export async function saveWorkspace(uid: string, data: WorkspaceData): Promise<void> {
  await setDoc(wsRef(uid), clean(data));
}

export async function loadBacktests(uid: string): Promise<Record<string, BacktestResultData>> {
  const snap = await getDocs(collection(db(), 'users', uid, 'backtests'));
  const out: Record<string, BacktestResultData> = {};
  snap.forEach((d) => (out[d.id] = d.data() as BacktestResultData));
  return out;
}

export async function saveBacktest(uid: string, tabId: string, data: BacktestResultData): Promise<void> {
  await setDoc(btRef(uid, tabId), clean({ ...data, annotations: [] }));
}

export async function removeBacktest(uid: string, tabId: string): Promise<void> {
  await deleteDoc(btRef(uid, tabId));
}
