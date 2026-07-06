'use client';

import { useEffect, useRef } from 'react';
import { OverlayMode, type OverlayEvent } from 'klinecharts';
import { useActiveChart } from '@/store/chartStore';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { useTradingStore, type Side } from '@/store/tradingStore';
import { useOrderToolStore, type OrderField } from '@/store/orderToolStore';
import { getSymbolInfo } from '@/lib/symbols';
import { registerLivePosition, LIVE_POSITION } from '@/lib/overlays/livePosition';
import { registerPositionLevel, POSITION_LEVEL } from '@/lib/overlays/positionLevel';

const ENTRY = '#3b82f6';
const STOP = '#dc2626';
const TARGET = '#16a34a';
const PENDING = '#a855f7';

// Live trade visuals on the active chart: a locked shaded risk/reward BOX per
// open position / pending / projection, plus a draggable LINE + LABEL per level
// (entry/SL/TP). Grabbing a line or its label anywhere across the chart adjusts
// the level (a filled position's entry is locked). Renders nothing.

interface BoxItem {
  key: string;
  time: number;
  entryPrice: number;
  sl?: number;
  tp?: number;
}

// What a dragged level commits to, carried in its extendData.
interface LevelExt {
  target: 'position' | 'pending' | 'projection';
  id: string; // trade id ('' for projection)
  field: OrderField;
  side: Side;
  entry: number; // for SL/TP side validation
  color?: string;
  label?: string;
}

interface LineSpec {
  value: number;
  time: number; // x-anchor so klinecharts finishes the overlay (draggable)
  lock: boolean; // filled-position entry is display-only
  ext: LevelExt;
}

const validSl = (side: Side, entry: number, v: number) => (side === 'long' ? v < entry : v > entry);
const validTp = (side: Side, entry: number, v: number) => (side === 'long' ? v > entry : v < entry);

function boxPoints(item: BoxItem) {
  return [
    { timestamp: item.time, value: item.entryPrice },
    { timestamp: item.time, value: item.sl ?? item.entryPrice },
    { timestamp: item.time, value: item.tp ?? item.entryPrice }
  ];
}

export function TradeLines() {
  const chart = useActiveChart();
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const { symbol } = useActiveTab();
  const info = getSymbolInfo(symbol);
  const prec = info.pricePrecision;
  const contractSize = info.contractSize;
  const positions = useTradingStore((s) => s.positions[activeTabId]);
  const pending = useTradingStore((s) => s.pending[activeTabId]);
  const entry = useOrderToolStore((s) => s.entry);
  const sl = useOrderToolStore((s) => s.sl);
  const tp = useOrderToolStore((s) => s.tp);
  const projecting = useOrderToolStore((s) => s.projecting);
  const composerSide = useOrderToolStore((s) => s.side);
  const lots = useOrderToolStore((s) => s.lots);
  const head = useReplayStore((s) => s.currentTimestamp);

  const boxesRef = useRef<Map<string, string>>(new Map());
  const linesRef = useRef<Map<string, { id: string; value: number; label: string }>>(new Map());
  const draggingRef = useRef<string | null>(null);
  const chartRef = useRef(chart);

  useEffect(() => {
    registerLivePosition();
    registerPositionLevel();
  }, []);

  // A composed order / projection shouldn't carry across tab switches.
  useEffect(() => {
    queueMicrotask(() => useOrderToolStore.getState().cancel());
  }, [activeTabId]);

  const setCursor = (cls: 'kx-grab' | 'kx-grabbing' | null) => {
    const el = document.body;
    el.classList.remove('kx-grab', 'kx-grabbing');
    if (cls) el.classList.add(cls);
  };

  const onEnter = () => {
    if (!draggingRef.current) setCursor('kx-grab');
    return false;
  };
  const onLeave = () => {
    if (!draggingRef.current) setCursor(null);
    return false;
  };
  const onLevelMoveStart = (e: OverlayEvent) => {
    draggingRef.current = e.overlay.id;
    setCursor('kx-grabbing');
    return false;
  };

  const commitLevel = (e: OverlayEvent) => {
    const ext = e.overlay.extendData as LevelExt;
    const v = e.overlay.points[0]?.value;
    const ts = e.overlay.points[0]?.timestamp;
    draggingRef.current = null;
    setCursor('kx-grab');
    if (v == null) return false;
    const tabId = useWorkspaceStore.getState().activeTabId;
    const store = useTradingStore.getState();

    let authoritative = v;
    if (ext.target === 'projection') {
      useOrderToolStore.getState().setValue(ext.field, v);
    } else if (ext.field === 'entry') {
      store.modifyPending(tabId, ext.id, { entryPrice: v });
    } else {
      const ok = ext.field === 'sl' ? validSl(ext.side, ext.entry, v) : validTp(ext.side, ext.entry, v);
      if (ok) {
        const patch = ext.field === 'sl' ? { sl: v } : { tp: v };
        if (ext.target === 'pending') store.modifyPending(tabId, ext.id, patch);
        else store.modify(tabId, ext.id, patch);
      } else {
        const src =
          ext.target === 'pending'
            ? (store.pending[tabId] ?? []).find((o) => o.id === ext.id)
            : (store.positions[tabId] ?? []).find((p) => p.id === ext.id);
        authoritative = (ext.field === 'sl' ? src?.sl : src?.tp) ?? ext.entry;
      }
    }
    chart?.overrideOverlay({ id: e.overlay.id, points: [{ timestamp: ts, value: authoritative }] });
    for (const rec of linesRef.current.values()) {
      if (rec.id === e.overlay.id) rec.value = authoritative;
    }
    return false;
  };

  useEffect(() => {
    if (!chart) return;
    if (chartRef.current !== chart) {
      boxesRef.current = new Map();
      linesRef.current = new Map();
      chartRef.current = chart;
    }
    const boxes = boxesRef.current;
    const lines = linesRef.current;
    const pipMult = Math.pow(10, prec - 1);

    const levelLabel = (field: OrderField, price: number, e2: number, qty: number, side: Side, s2?: number, t2?: number) => {
      if (field === 'entry') {
        const rr = s2 != null && t2 != null && Math.abs(e2 - s2) > 0 ? (Math.abs(t2 - e2) / Math.abs(e2 - s2)).toFixed(2) : '—';
        return `${side === 'long' ? 'LONG' : 'SHORT'} ${qty}  ${price.toFixed(prec)}  R/R ${rr}`;
      }
      const dist = Math.abs(price - e2);
      return `${field.toUpperCase()} ${price.toFixed(prec)}  ${(dist * pipMult).toFixed(1)}p  ${field === 'tp' ? '+' : '-'}${(dist * qty).toFixed(2)}`;
    };

    // --- shaded risk/reward boxes ---
    const desiredBoxes = new Map<string, BoxItem>();
    for (const p of positions ?? []) desiredBoxes.set(`position:${p.id}`, { key: `position:${p.id}`, time: p.entryTime, entryPrice: p.entryPrice, sl: p.sl, tp: p.tp });
    for (const o of pending ?? []) desiredBoxes.set(`pending:${o.id}`, { key: `pending:${o.id}`, time: o.createdTime, entryPrice: o.entryPrice, sl: o.sl, tp: o.tp });
    if (projecting && entry != null && head != null)
      desiredBoxes.set('projection', { key: 'projection', time: head, entryPrice: entry, sl: sl ?? undefined, tp: tp ?? undefined });

    for (const [key, id] of boxes) {
      if (!desiredBoxes.has(key)) {
        chart.removeOverlay(id);
        boxes.delete(key);
      }
    }
    for (const [key, item] of desiredBoxes) {
      const points = boxPoints(item);
      const existing = boxes.get(key);
      if (existing) chart.overrideOverlay({ id: existing, points });
      else {
        const id = chart.createOverlay({ name: LIVE_POSITION, lock: true, points });
        if (typeof id === 'string') boxes.set(key, id);
      }
    }

    // --- draggable level lines + labels ---
    const anchor = head ?? Date.now();
    const desired = new Map<string, LineSpec & { label: string }>();
    const add = (key: string, color: string, lock: boolean, value: number, time: number, field: OrderField, target: LevelExt['target'], id: string, side: Side, e2: number, qty: number, s2?: number, t2?: number) => {
      const label = levelLabel(field, value, e2, qty, side, s2, t2);
      desired.set(key, { value, time, lock, label, ext: { target, id, field, side, entry: e2, color, label } });
    };
    for (const p of positions ?? []) {
      const qty = p.size * contractSize;
      add(`position:${p.id}:entry`, ENTRY, true, p.entryPrice, p.entryTime, 'entry', 'position', p.id, p.side, p.entryPrice, qty, p.sl, p.tp);
      if (p.sl != null) add(`position:${p.id}:sl`, STOP, false, p.sl, p.entryTime, 'sl', 'position', p.id, p.side, p.entryPrice, qty);
      if (p.tp != null) add(`position:${p.id}:tp`, TARGET, false, p.tp, p.entryTime, 'tp', 'position', p.id, p.side, p.entryPrice, qty);
    }
    for (const o of pending ?? []) {
      const qty = o.size * contractSize;
      add(`pending:${o.id}:entry`, PENDING, false, o.entryPrice, o.createdTime, 'entry', 'pending', o.id, o.side, o.entryPrice, qty, o.sl, o.tp);
      if (o.sl != null) add(`pending:${o.id}:sl`, STOP, false, o.sl, o.createdTime, 'sl', 'pending', o.id, o.side, o.entryPrice, qty);
      if (o.tp != null) add(`pending:${o.id}:tp`, TARGET, false, o.tp, o.createdTime, 'tp', 'pending', o.id, o.side, o.entryPrice, qty);
    }
    if (projecting && entry != null) {
      const qty = lots * contractSize;
      add('projection:entry', PENDING, false, entry, anchor, 'entry', 'projection', '', composerSide, entry, qty, sl ?? undefined, tp ?? undefined);
      if (sl != null) add('projection:sl', STOP, false, sl, anchor, 'sl', 'projection', '', composerSide, entry, qty);
      if (tp != null) add('projection:tp', TARGET, false, tp, anchor, 'tp', 'projection', '', composerSide, entry, qty);
    }

    for (const [key, rec] of lines) {
      if (!desired.has(key)) {
        chart.removeOverlay(rec.id);
        lines.delete(key);
      }
    }
    for (const [key, spec] of desired) {
      const existing = lines.get(key);
      if (existing) {
        if (existing.id !== draggingRef.current && (existing.value !== spec.value || existing.label !== spec.label)) {
          chart.overrideOverlay({ id: existing.id, points: [{ timestamp: spec.time, value: spec.value }], extendData: spec.ext });
          existing.value = spec.value;
          existing.label = spec.label;
        }
      } else if (spec.lock) {
        // Filled-position entry: display-only line + label, no drag/cursor.
        const id = chart.createOverlay({ name: POSITION_LEVEL, lock: true, points: [{ timestamp: spec.time, value: spec.value }], extendData: spec.ext, onRightClick: () => true });
        if (typeof id === 'string') lines.set(key, { id, value: spec.value, label: spec.label });
      } else {
        const id = chart.createOverlay({
          name: POSITION_LEVEL,
          lock: false,
          mode: OverlayMode.Normal,
          points: [{ timestamp: spec.time, value: spec.value }],
          extendData: spec.ext,
          onPressedMoveStart: onLevelMoveStart,
          onPressedMoveEnd: commitLevel,
          onMouseEnter: onEnter,
          onMouseLeave: onLeave,
          onRightClick: () => true
        });
        if (typeof id === 'string') lines.set(key, { id, value: spec.value, label: spec.label });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, positions, pending, entry, sl, tp, prec, contractSize, projecting, composerSide, lots, head]);

  return null;
}
