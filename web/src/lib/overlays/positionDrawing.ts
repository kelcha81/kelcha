import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool } from '@/lib/tools/defineTool';
import { activePrecision } from '@/lib/overlays/fibTool';

// Long/Short position DRAWING (3 points: entry, stop, target): the classic
// risk/reward box — red stop zone, green target zone, R:R label. Unlike the
// order-composer position tool, this is a plain persisted drawing for
// forecasting/annotation; it never touches the order ticket.

const NAME = 'fx-position';

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 3 || overlay.points.length < 3) return [];
  const [e, s, t] = coordinates as Array<{ x: number; y: number }>;
  const left = Math.min(e.x, s.x, t.x);
  let right = Math.max(e.x, s.x, t.x);
  if (right - left < 160) right = left + 200;
  const midX = (left + right) / 2;

  const entry = overlay.points[0].value ?? 0;
  const stop = overlay.points[1].value ?? 0;
  const target = overlay.points[2].value ?? 0;
  const prec = activePrecision();
  const pip = Math.pow(10, prec - 1);

  const riskDist = Math.abs(entry - stop);
  const rewardDist = Math.abs(target - entry);
  const rr = riskDist > 0 ? (rewardDist / riskDist).toFixed(2) : '—';

  const zone = (y2: number, color: string): OverlayFigure => ({
    type: 'polygon',
    ignoreEvent: true,
    attrs: { coordinates: [{ x: left, y: e.y }, { x: right, y: e.y }, { x: right, y: y2 }, { x: left, y: y2 }] },
    styles: { style: 'fill', color }
  });
  const line = (y: number, color: string): OverlayFigure => ({
    type: 'line',
    attrs: { coordinates: [{ x: left, y }, { x: right, y }] },
    styles: { color }
  });
  const pill = (x: number, y: number, text: string, bg: string, align: string, baseline: string): OverlayFigure => ({
    type: 'text',
    attrs: { x, y, text, align, baseline },
    styles: { color: '#ffffff', size: 11, family: 'inherit', backgroundColor: bg, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, borderRadius: 4 }
  });

  return [
    zone(t.y, 'rgba(22,163,74,0.12)'),
    zone(s.y, 'rgba(220,38,38,0.12)'),
    line(e.y, '#3b82f6'),
    line(s.y, '#dc2626'),
    line(t.y, '#16a34a'),
    pill(left, t.y, `Target ${target.toFixed(prec)}  +${(rewardDist * pip).toFixed(1)} pips`, '#16a34a', 'left', 'bottom'),
    pill(midX, e.y, `Entry ${entry.toFixed(prec)} · R/R ${rr}`, '#3b82f6', 'center', 'middle'),
    pill(left, s.y, `Stop ${stop.toFixed(prec)}  −${(riskDist * pip).toFixed(1)} pips`, '#dc2626', 'left', 'top')
  ];
}

export function registerPositionDrawing(): void {
  defineTool({
    name: NAME,
    totalStep: 4, // 3 points
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: figures
  });
}

export const POSITION_DRAWING = NAME;
