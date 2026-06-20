'use client';

import { useEffect, useRef } from 'react';
import { useActiveChart } from '@/store/chartStore';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useTradingStore } from '@/store/tradingStore';
import { useOrderToolStore } from '@/store/orderToolStore';
import { getSymbolInfo } from '@/lib/symbols';
import { registerPriceTag, PRICE_TAG } from '@/lib/overlays/priceTag';
import { registerLivePosition, LIVE_POSITION } from '@/lib/overlays/livePosition';

const ENTRY = '#3b82f6';
const STOP = '#dc2626';
const TARGET = '#16a34a';

/**
 * Renders live trade visuals on the active chart: open positions and pending
 * orders as persistent entry/SL/TP boxes (until closed/filled/cancelled), and
 * the order being composed as colored price-axis tags. Driven by trading state,
 * locked, non-persisted. Renders nothing.
 */
export function TradeLines() {
  const chart = useActiveChart();
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const { symbol } = useActiveTab();
  const prec = getSymbolInfo(symbol).pricePrecision;
  const positions = useTradingStore((s) => s.positions[activeTabId]);
  const pending = useTradingStore((s) => s.pending[activeTabId]);
  const entry = useOrderToolStore((s) => s.entry);
  const sl = useOrderToolStore((s) => s.sl);
  const tp = useOrderToolStore((s) => s.tp);

  const idsRef = useRef<string[]>([]);

  useEffect(() => {
    registerPriceTag();
    registerLivePosition();
  }, []);

  useEffect(() => {
    if (!chart) return;
    for (const id of idsRef.current) chart.removeOverlay(id);
    idsRef.current = [];
    const track = (id: string | null | Array<string | null>) => {
      if (typeof id === 'string') idsRef.current.push(id);
    };

    // Open positions + pending → persistent boxes that stay until closed.
    const boxes = [
      ...(positions ?? []).map((p) => ({ ...p, time: p.entryTime, pending: false })),
      ...(pending ?? []).map((o) => ({ ...o, time: o.createdTime, pending: true }))
    ];
    for (const b of boxes) {
      track(
        chart.createOverlay({
          name: LIVE_POSITION,
          lock: true,
          points: [
            { timestamp: b.time, value: b.entryPrice },
            { timestamp: b.time, value: b.sl ?? b.entryPrice },
            { timestamp: b.time, value: b.tp ?? b.entryPrice }
          ],
          extendData: { qty: b.size * b.contractSize, prec, side: b.side, pending: b.pending }
        })
      );
    }

    // The order being composed → axis tags only.
    const tags: { value: number; color: string }[] = [];
    if (entry != null) tags.push({ value: entry, color: ENTRY });
    if (sl != null) tags.push({ value: sl, color: STOP });
    if (tp != null) tags.push({ value: tp, color: TARGET });
    for (const t of tags) {
      track(chart.createOverlay({ name: PRICE_TAG, lock: true, points: [{ value: t.value }], extendData: { color: t.color, prec } }));
    }
  }, [chart, positions, pending, entry, sl, tp, prec]);

  return null;
}
