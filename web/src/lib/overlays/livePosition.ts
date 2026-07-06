import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// Box for a LIVE order/position: entry/SL/TP zones + labels, spanning from the
// entry candle to the right edge. Driven by trading state (non-persisted) so it
// stays on the chart until the position closes. Created draggable by TradeLines
// (default point handles on) so SL/TP (and a pending's entry) can be adjusted on
// the chart; the zone/line/pill figures stay ignoreEvent so only the handles grab.

const NAME = 'livePosition';
let registered = false;

interface Ext {
  qty?: number;
  prec?: number;
  side?: string;
  pending?: boolean;
}

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 3 || overlay.points.length < 3) return [];
  const [e, s, t] = coordinates as Array<{ x: number; y: number }>;
  const right = bounding.width;
  const left = Math.max(-2, Math.min(e.x, right - 60));

  const entry = overlay.points[0].value ?? 0;
  const stop = overlay.points[1].value ?? 0;
  const target = overlay.points[2].value ?? 0;
  const ext = (overlay.extendData ?? {}) as Ext;
  const qty = ext.qty ?? 0;
  const prec = ext.prec ?? 5;
  const side = ext.side === 'short' ? 'SHORT' : 'LONG';
  const pip = Math.pow(10, prec - 1);
  const riskDist = Math.abs(entry - stop);
  const rewardDist = Math.abs(target - entry);
  const rr = riskDist > 0 ? (rewardDist / riskDist).toFixed(2) : '—';
  const entryColor = ext.pending ? '#a855f7' : '#3b82f6';

  const figs: OverlayFigure[] = [];
  const hasTp = overlay.points[2].value != null && target !== entry;
  const hasSl = overlay.points[1].value != null && stop !== entry;

  const zone = (y2: number, color: string) =>
    figs.push({
      type: 'polygon',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: left, y: e.y }, { x: right, y: e.y }, { x: right, y: y2 }, { x: left, y: y2 }] },
      styles: { style: 'fill', color }
    });
  const line = (y: number, color: string) =>
    figs.push({ type: 'line', ignoreEvent: true, attrs: { coordinates: [{ x: left, y }, { x: right, y }] }, styles: { color, size: 1 } });
  const pill = (y: number, text: string, bg: string, baseline: string) =>
    figs.push({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: left + 2, y, text, align: 'left', baseline },
      styles: { color: '#ffffff', size: 11, family: 'inherit', backgroundColor: bg, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2, borderRadius: 3 }
    });

  if (hasTp) zone(t.y, 'rgba(22,163,74,0.10)');
  if (hasSl) zone(s.y, 'rgba(220,38,38,0.10)');
  line(e.y, entryColor);
  if (hasSl) line(s.y, '#dc2626');
  if (hasTp) line(t.y, '#16a34a');

  pill(e.y, `${side} ${qty}${ext.pending ? ' (pending)' : ''}  R/R ${rr}`, entryColor, 'middle');
  if (hasTp) pill(t.y, `TP ${target.toFixed(prec)}  ${(rewardDist * pip).toFixed(1)}  +${(rewardDist * qty).toFixed(2)}`, '#16a34a', 'bottom');
  if (hasSl) pill(s.y, `SL ${stop.toFixed(prec)}  ${(riskDist * pip).toFixed(1)}  -${(riskDist * qty).toFixed(2)}`, '#dc2626', 'top');

  return figs;
}

export function registerLivePosition(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: NAME,
    totalStep: 4,
    // draggable handles on the entry/SL/TP points (TradeLines maps a moved
    // handle → tradingStore.modify / modifyPending on onPressedMoveEnd)
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: figures
  });
}

export const LIVE_POSITION = NAME;
