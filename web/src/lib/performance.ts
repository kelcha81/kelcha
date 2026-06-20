import type { Trade } from '@/store/tradingStore';
import { getRange } from '@/lib/candleSource';

export interface PerfStats {
  trades: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  expectancy: number;
  avgR: number;
  sharpe: number;
  maxDrawdown: number;
}

export interface EquityPoint {
  t: number;
  equity: number;
  drawdown: number;
}

const byExit = (a: Trade, b: Trade) => a.exitTime - b.exitTime;

/** Running equity (from a starting balance) + drawdown-from-peak at each close. */
export function equityCurve(trades: Trade[], startBalance: number): EquityPoint[] {
  let eq = startBalance;
  let peak = startBalance;
  const pts: EquityPoint[] = [{ t: trades[0]?.entryTime ?? 0, equity: eq, drawdown: 0 }];
  for (const tr of [...trades].sort(byExit)) {
    eq += tr.pnl;
    peak = Math.max(peak, eq);
    pts.push({ t: tr.exitTime, equity: eq, drawdown: peak - eq });
  }
  return pts;
}

export function computeStats(trades: Trade[], startBalance: number): PerfStats {
  const n = trades.length;
  const pnls = trades.map((t) => t.pnl);
  const grossWin = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  const total = grossWin - grossLoss;

  const rs = trades.filter((t) => t.risk && t.risk > 0).map((t) => t.pnl / (t.risk as number));

  // Sharpe of per-trade returns (not annualised — a comparability metric).
  const rets = pnls.map((p) => p / startBalance);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1));
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(rets.length || 1) : 0;

  const eq = equityCurve(trades, startBalance);
  const maxDrawdown = eq.reduce((m, p) => Math.max(m, p.drawdown), 0);

  return {
    trades: n,
    winRate: n ? pnls.filter((p) => p > 0).length / n : 0,
    totalPnl: total,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: n ? total / n : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    sharpe,
    maxDrawdown
  };
}

/** Max favourable / adverse excursion (account currency) over the trade's life. */
export async function maeMfe(symbol: string, t: Trade): Promise<{ mae: number; mfe: number }> {
  const bars = await getRange(symbol, 'm1', t.entryTime, t.exitTime);
  let mfe = 0;
  let mae = 0;
  for (const b of bars) {
    const fav = t.side === 'long' ? b.high - t.entryPrice : t.entryPrice - b.low;
    const adv = t.side === 'long' ? b.low - t.entryPrice : t.entryPrice - b.high;
    mfe = Math.max(mfe, fav);
    mae = Math.min(mae, adv);
  }
  const mult = t.contractSize * t.size;
  return { mfe: mfe * mult, mae: mae * mult };
}
