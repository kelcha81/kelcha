'use client';

import { useEffect, useRef } from 'react';
import type { OverlayEvent } from 'klinecharts';
import { useActiveChart } from '@/store/chartStore';
import { useWorkspaceStore, useActiveTab } from '@/store/workspaceStore';
import { useReplayStore } from '@/store/replayStore';
import { useTradingStore, type Side } from '@/store/tradingStore';
import { useOrderToolStore } from '@/store/orderToolStore';
import { getSymbolInfo } from '@/lib/symbols';
import { registerPriceTag, PRICE_TAG } from '@/lib/overlays/priceTag';
import { registerLivePosition, LIVE_POSITION } from '@/lib/overlays/livePosition';

const ENTRY = '#3b82f6';
const STOP = '#dc2626';
const TARGET = '#16a34a';

// One draggable box per open position / resting order, keyed by trade id so a
// value change (panel edit or a chart drag) updates in place — no remove/recreate
// flicker and a drag is never destroyed mid-gesture. The order being composed
// renders as (non-draggable) price-axis tags. Driven by trading state; renders nothing.

interface BoxItem {
  key: string;
  id: string;
  kind: 'position' | 'pending';
  time: number;
  side: Side;
  entryPrice: number;
  sl?: number;
  tp?: number;
  size: number;
  contractSize: number;
}

interface BoxExt {
  id: string;
  kind: 'position' | 'pending';
  side: Side;
  qty: number;
  prec: number;
  entry: number;
  sl?: number;
  tp?: number;
  pending: boolean;
}

function boxPoints(item: BoxItem) {
  // SL/TP default to entry when absent so their handle sits on the entry line
  // and can be dragged out to create the level.
  return [
    { timestamp: item.time, value: item.entryPrice },
    { timestamp: item.time, value: item.sl ?? item.entryPrice },
    { timestamp: item.time, value: item.tp ?? item.entryPrice }
  ];
}

function boxExt(item: BoxItem, prec: number): BoxExt {
  return {
    id: item.id,
    kind: item.kind,
    side: item.side,
    qty: item.size * item.contractSize,
    prec,
    entry: item.entryPrice,
    sl: item.sl,
    tp: item.tp,
    pending: item.kind === 'pending'
  };
}

// SL must sit on the losing side of entry, TP on the winning side.
const validSl = (side: Side, entry: number, v: number) => (side === 'long' ? v < entry : v > entry);
const validTp = (side: Side, entry: number, v: number) => (side === 'long' ? v > entry : v < entry);

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

  const boxesRef = useRef<Map<string, string>>(new Map()); // trackKey → overlayId
  const projectionRef = useRef<string | null>(null); // the composed-order projection overlay
  const tagsRef = useRef<string[]>([]);
  const draggingRef = useRef<string | null>(null); // overlayId being dragged
  const chartRef = useRef(chart);

  // A composed order / projection shouldn't carry across tab switches.
  useEffect(() => {
    queueMicrotask(() => useOrderToolStore.getState().cancel());
  }, [activeTabId]);

  useEffect(() => {
    registerPriceTag();
    registerLivePosition();
  }, []);

  // Re-derive the authoritative box for one overlay from the live store and push
  // it back — snaps an ignored/invalid drag (or a committed one) to true state.
  const snapBack = (overlayId: string, ext: BoxExt) => {
    if (!chart) return;
    const st = useTradingStore.getState();
    const tabId = useWorkspaceStore.getState().activeTabId;
    const src =
      ext.kind === 'position'
        ? (st.positions[tabId] ?? []).find((p) => p.id === ext.id)
        : (st.pending[tabId] ?? []).find((o) => o.id === ext.id);
    if (!src) {
      chart.removeOverlay(overlayId);
      return;
    }
    const item: BoxItem = {
      key: '',
      id: ext.id,
      kind: ext.kind,
      time: ext.kind === 'position' ? (src as { entryTime: number }).entryTime : (src as { createdTime: number }).createdTime,
      side: src.side,
      entryPrice: src.entryPrice,
      sl: src.sl,
      tp: src.tp,
      size: src.size,
      contractSize: src.contractSize
    };
    chart.overrideOverlay({ id: overlayId, points: boxPoints(item), extendData: boxExt(item, ext.prec) });
  };

  const onPressedMoveStart = (e: OverlayEvent) => {
    draggingRef.current = e.overlay.id;
    return false;
  };

  const onPressedMoveEnd = (e: OverlayEvent) => {
    const ext = e.overlay.extendData as BoxExt;
    const tabId = useWorkspaceStore.getState().activeTabId;
    const store = useTradingStore.getState();
    const pts = e.overlay.points;
    const nEntry = pts[0]?.value;
    const nSl = pts[1]?.value;
    const nTp = pts[2]?.value;
    const baseSl = ext.sl ?? ext.entry;
    const baseTp = ext.tp ?? ext.entry;

    // Exactly one handle moves per gesture; find it and commit that level.
    if (ext.kind === 'pending') {
      if (nEntry != null && nEntry !== ext.entry) store.modifyPending(tabId, ext.id, { entryPrice: nEntry });
      else if (nSl != null && nSl !== baseSl && validSl(ext.side, ext.entry, nSl)) store.modifyPending(tabId, ext.id, { sl: nSl });
      else if (nTp != null && nTp !== baseTp && validTp(ext.side, ext.entry, nTp)) store.modifyPending(tabId, ext.id, { tp: nTp });
    } else {
      // Open position: entry is filled and not adjustable (snaps back).
      if (nSl != null && nSl !== baseSl && validSl(ext.side, ext.entry, nSl)) store.modify(tabId, ext.id, { sl: nSl });
      else if (nTp != null && nTp !== baseTp && validTp(ext.side, ext.entry, nTp)) store.modify(tabId, ext.id, { tp: nTp });
    }

    draggingRef.current = null;
    snapBack(e.overlay.id, ext); // reset even when nothing committed (invalid / entry drag)
    return false;
  };

  // Dragging the projection edits the composer (bidirectional with the ticket).
  const onProjectionMoveEnd = (e: OverlayEvent) => {
    const pts = e.overlay.points;
    const store = useOrderToolStore.getState();
    if (pts[0]?.value != null) store.setValue('entry', pts[0].value);
    if (pts[1]?.value != null) store.setValue('sl', pts[1].value);
    if (pts[2]?.value != null) store.setValue('tp', pts[2].value);
    draggingRef.current = null;
    return false;
  };

  useEffect(() => {
    if (!chart) return;
    // Active chart changed → the old chart's overlays went with it; start clean.
    if (chartRef.current !== chart) {
      boxesRef.current = new Map();
      tagsRef.current = [];
      chartRef.current = chart;
    }
    const map = boxesRef.current;

    const desired = new Map<string, BoxItem>();
    for (const p of positions ?? [])
      desired.set(`position:${p.id}`, {
        key: `position:${p.id}`,
        id: p.id,
        kind: 'position',
        time: p.entryTime,
        side: p.side,
        entryPrice: p.entryPrice,
        sl: p.sl,
        tp: p.tp,
        size: p.size,
        contractSize: p.contractSize
      });
    for (const o of pending ?? [])
      desired.set(`pending:${o.id}`, {
        key: `pending:${o.id}`,
        id: o.id,
        kind: 'pending',
        time: o.createdTime,
        side: o.side,
        entryPrice: o.entryPrice,
        sl: o.sl,
        tp: o.tp,
        size: o.size,
        contractSize: o.contractSize
      });

    // Remove boxes whose trade is gone (closed / filled / cancelled).
    for (const [key, id] of map) {
      if (!desired.has(key)) {
        chart.removeOverlay(id);
        map.delete(key);
      }
    }
    // Create new boxes; update existing in place (skip one being dragged).
    for (const [key, item] of desired) {
      const points = boxPoints(item);
      const extendData = boxExt(item, prec);
      const existing = map.get(key);
      if (existing) {
        if (existing !== draggingRef.current) chart.overrideOverlay({ id: existing, points, extendData });
      } else {
        const id = chart.createOverlay({ name: LIVE_POSITION, lock: false, points, extendData, onPressedMoveStart, onPressedMoveEnd });
        if (typeof id === 'string') map.set(key, id);
      }
    }

    // Order projection (composing via the position tool): one draggable box that
    // replaces the plain axis tags. Editing it feeds the composer and vice-versa.
    if (projecting && entry != null && head != null) {
      const points = [
        { timestamp: head, value: entry },
        { timestamp: head, value: sl ?? entry },
        { timestamp: head, value: tp ?? entry }
      ];
      const extendData = {
        id: '__projection__',
        kind: 'pending',
        side: composerSide,
        qty: lots * contractSize,
        prec,
        entry,
        sl: sl ?? undefined,
        tp: tp ?? undefined,
        pending: true,
        label: 'new'
      };
      if (projectionRef.current) {
        if (projectionRef.current !== draggingRef.current) chart.overrideOverlay({ id: projectionRef.current, points, extendData });
      } else {
        const id = chart.createOverlay({ name: LIVE_POSITION, lock: false, points, extendData, onPressedMoveStart, onPressedMoveEnd: onProjectionMoveEnd });
        if (typeof id === 'string') projectionRef.current = id;
      }
    } else if (projectionRef.current) {
      chart.removeOverlay(projectionRef.current);
      projectionRef.current = null;
    }

    // When NOT projecting, show plain axis tags for any picked levels.
    for (const t of tagsRef.current) chart.removeOverlay(t);
    tagsRef.current = [];
    if (!projecting) {
      const tags: { value: number; color: string }[] = [];
      if (entry != null) tags.push({ value: entry, color: ENTRY });
      if (sl != null) tags.push({ value: sl, color: STOP });
      if (tp != null) tags.push({ value: tp, color: TARGET });
      for (const t of tags) {
        const id = chart.createOverlay({ name: PRICE_TAG, lock: true, points: [{ value: t.value }], extendData: { color: t.color, prec } });
        if (typeof id === 'string') tagsRef.current.push(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, positions, pending, entry, sl, tp, prec, contractSize, projecting, composerSide, lots, head]);

  return null;
}
