'use client';

import { useRef, useState } from 'react';
import { useReplayStore } from '@/store/replayStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTradingStore, type Trade } from '@/store/tradingStore';

const EMPTY_TRADES: Trade[] = [];
const fmt = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace('T', ' ');

/**
 * Session timeline: the whole session mapped to a horizontal track. Click or
 * drag anywhere to move the replay head (rAF-throttled while dragging); hover
 * shows the time under the cursor; closed trades appear as win/loss ticks.
 */
export function TimelineScrubber() {
  const bounds = useReplayStore((s) => s.bounds);
  const head = useReplayStore((s) => s.currentTimestamp);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const trades = useTradingStore((s) => s.trades[activeTabId] ?? EMPTY_TRADES);

  const trackRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const pendingTs = useRef<number | null>(null);
  const [hover, setHover] = useState<{ x: number; ts: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  if (!bounds || !head) return null;
  const span = bounds.max - bounds.min;
  if (span <= 0) return null;

  const pctOf = (ts: number) => ((ts - bounds.min) / span) * 100;
  const tsAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return bounds.min + frac * span;
  };

  // Seeks are rAF-coalesced so a fast drag doesn't flood the replay store.
  const queueSeek = (ts: number) => {
    pendingTs.current = ts;
    raf.current ??= requestAnimationFrame(() => {
      raf.current = null;
      if (pendingTs.current != null) useReplayStore.getState().setTimestamp(pendingTs.current);
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const ts = tsAt(e.clientX);
    if (ts == null) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    queueSeek(ts);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const ts = tsAt(e.clientX);
    if (ts == null) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) setHover({ x: e.clientX - rect.left, ts });
    if (dragging) queueSeek(ts);
  };
  const onPointerUp = () => setDragging(false);

  // Cap the marker count so a huge blotter can't flood the DOM.
  const markers = trades.slice(-200);

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Session timeline"
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={head}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      className="group relative h-6 min-w-24 flex-1 cursor-pointer select-none touch-none"
    >
      {/* track + progress */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-slate-800">
        <div className="h-full rounded bg-blue-600/70" style={{ width: `${pctOf(head)}%` }} />
      </div>

      {/* trade ticks (win/loss at exit time) */}
      {markers.map((t) => (
        <span
          key={t.id}
          className={`absolute top-1/2 h-2 w-0.5 -translate-y-1/2 ${t.pnl >= 0 ? 'bg-green-400/80' : 'bg-red-400/80'}`}
          style={{ left: `${pctOf(t.exitTime)}%` }}
        />
      ))}

      {/* head handle */}
      <div
        className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-blue-400 shadow"
        style={{ left: `${pctOf(head)}%` }}
      />

      {/* hover time tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-200 shadow"
          style={{ left: hover.x }}
        >
          {fmt(hover.ts)}
        </div>
      )}
    </div>
  );
}
