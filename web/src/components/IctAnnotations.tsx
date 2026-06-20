'use client';

import { useEffect, useRef } from 'react';
import { useActiveChart } from '@/store/chartStore';
import { useActiveTab, useWorkspaceStore } from '@/store/workspaceStore';
import { useBacktestStore } from '@/store/backtestStore';
import { getSymbolInfo } from '@/lib/symbols';
import type { IctAnnotation } from '@/lib/strategyApi';
import { registerIctBox, ICT_BOX } from '@/lib/overlays/ictBox';
import { registerIctLevel, ICT_LEVEL } from '@/lib/overlays/ictLevel';
import { registerIctTradeBox, ICT_TRADE_BOX } from '@/lib/overlays/ictTradeBox';

// Cap how many annotation overlays we draw so a long backtest can't flood the chart.
const MAX_ANNOTATIONS = 400;

const BOX_STYLE: Record<string, { color: string; fill: string; label: string }> = {
  'fvg:bull': { color: '#16a34a', fill: 'rgba(22,163,74,0.10)', label: 'FVG' },
  'fvg:bear': { color: '#dc2626', fill: 'rgba(220,38,38,0.10)', label: 'FVG' },
  'order_block:bull': { color: '#3b82f6', fill: 'rgba(59,130,246,0.10)', label: 'OB' },
  'order_block:bear': { color: '#f59e0b', fill: 'rgba(245,158,11,0.10)', label: 'OB' }
};

const LEVEL_STYLE: Record<string, { color: string; dashed: boolean; label: string }> = {
  liquidity: { color: '#94a3b8', dashed: true, label: 'LIQ' },
  liquidity_sweep: { color: '#f59e0b', dashed: false, label: 'sweep' },
  bos: { color: '#14b8a6', dashed: false, label: 'BOS' },
  mss: { color: '#a855f7', dashed: false, label: 'MSS' }
};

const GROUP: Record<string, 'zones' | 'liquidity' | 'structure'> = {
  fvg: 'zones',
  order_block: 'zones',
  liquidity: 'liquidity',
  liquidity_sweep: 'liquidity',
  bos: 'structure',
  mss: 'structure'
};

/**
 * Renders the latest backtest's ICT annotations + trades on the active chart as
 * locked, non-persisted overlays. Driven by the backtest store. Renders nothing.
 */
export function IctAnnotations() {
  const chart = useActiveChart();
  const { symbol } = useActiveTab();
  const prec = getSymbolInfo(symbol).pricePrecision;
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const result = useBacktestStore((s) => s.results[activeTabId]);
  const showZones = useBacktestStore((s) => s.showZones);
  const showLiquidity = useBacktestStore((s) => s.showLiquidity);
  const showStructure = useBacktestStore((s) => s.showStructure);
  const showTrades = useBacktestStore((s) => s.showTrades);
  const selectedTradeId = useBacktestStore((s) => s.selected[activeTabId] ?? null);

  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    registerIctBox();
    registerIctLevel();
    registerIctTradeBox();
  }, []);

  useEffect(() => {
    if (!chart) return;
    for (const id of idsRef.current) chart.removeOverlay(id);
    idsRef.current = [];
    const resultSymbol = result?.symbol ?? null;
    const annotations = result?.annotations ?? [];
    const trades = result?.trades ?? [];
    // Only draw a result on the chart it was run for (timestamps would otherwise
    // line up against the wrong symbol's candles).
    if (resultSymbol !== symbol) return;
    const track = (id: string | null | Array<string | null>) => {
      if (typeof id === 'string') idsRef.current.push(id);
    };

    const visible = (a: IctAnnotation): boolean => {
      const g = GROUP[a.type];
      if (g === 'zones') return showZones;
      if (g === 'liquidity') return showLiquidity;
      if (g === 'structure') return showStructure;
      return false;
    };

    const shown = annotations.filter(visible).slice(-MAX_ANNOTATIONS);
    for (const a of shown) {
      if (a.type === 'fvg' || a.type === 'order_block') {
        if (a.top == null || a.bottom == null) continue;
        const style = BOX_STYLE[`${a.type}:${a.direction}`] ?? BOX_STYLE['fvg:bull'];
        const end = a.tEnd ?? a.mitigatedAt ?? a.tStart;
        track(
          chart.createOverlay({
            name: ICT_BOX,
            lock: true,
            points: [
              { timestamp: a.tStart, value: a.top },
              { timestamp: end, value: a.bottom }
            ],
            extendData: {
              color: style.color,
              fill: style.fill,
              label: style.label,
              open: a.tEnd == null && a.mitigatedAt == null,
              mitigated: a.mitigatedAt != null
            }
          })
        );
      } else {
        const style = LEVEL_STYLE[a.type];
        const value = a.price;
        if (!style || value == null) continue;
        const label = typeof a.meta?.kind === 'string' ? a.meta.kind : style.label;
        track(
          chart.createOverlay({
            name: ICT_LEVEL,
            lock: true,
            points: [{ timestamp: a.tStart, value }],
            extendData: { color: style.color, dashed: style.dashed, label }
          })
        );
      }
    }

    // Draw ONLY the trade selected in the table, as a full SL/TP bracket on its
    // candles (drawing every trade just piles markers at the right edge for any
    // trade ahead of the replay head). Jump-to-trade moves the head to the exit,
    // so the entry→exit candles are loaded and the box renders over them.
    if (showTrades && selectedTradeId) {
      const sel = trades.find((t) => t.id === selectedTradeId);
      if (sel) {
        track(
          chart.createOverlay({
            name: ICT_TRADE_BOX,
            lock: true,
            points: [
              { timestamp: sel.entryTime, value: sel.entryPrice },
              { timestamp: sel.exitTime, value: sel.exitPrice },
              { timestamp: sel.entryTime, value: sel.sl ?? sel.entryPrice },
              { timestamp: sel.entryTime, value: sel.tp ?? sel.entryPrice }
            ],
            extendData: {
              side: sel.side,
              hasSl: sel.sl != null,
              hasTp: sel.tp != null,
              qty: (sel.size ?? 0) * (sel.contractSize ?? 0),
              prec,
              pnl: sel.pnl
            }
          })
        );
      }
    }
  }, [chart, result, showZones, showLiquidity, showStructure, showTrades, selectedTradeId, symbol, prec]);

  return null;
}
