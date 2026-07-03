import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, fillOf } from '@/lib/tools/defineTool';
import { activePrecision } from '@/lib/overlays/fibTool';

// Measure tool (2 points, EPHEMERAL — never persisted): a shaded range showing
// Δprice, pips, %, bar count and elapsed market time. Green when measuring up,
// red when down. Dismissed on deselect (click elsewhere) or Esc.

const NAME = 'fx-measure';

function human(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2 || overlay.points.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const p0 = overlay.points[0];
  const p1 = overlay.points[1];
  const v0 = p0.value ?? 0;
  const v1 = p1.value ?? 0;
  const up = v1 >= v0;
  const color = up ? '#16a34a' : '#dc2626';

  const prec = activePrecision();
  const dPrice = v1 - v0;
  const pips = dPrice * Math.pow(10, prec - 1);
  const pct = v0 !== 0 ? (dPrice / v0) * 100 : 0;
  const bars =
    p0.dataIndex != null && p1.dataIndex != null ? Math.abs(p1.dataIndex - p0.dataIndex) : null;
  const dt = p0.timestamp != null && p1.timestamp != null ? Math.abs(p1.timestamp - p0.timestamp) : null;

  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const midX = (x0 + x1) / 2;

  const line1 = `${up ? '+' : ''}${dPrice.toFixed(prec)}  (${pips.toFixed(1)} pips, ${pct.toFixed(2)}%)`;
  const line2 = `${bars != null ? `${bars} bars` : ''}${bars != null && dt != null ? ' · ' : ''}${dt != null ? human(dt) : ''}`;

  const pill = (y: number, text: string, baseline: string): OverlayFigure => ({
    type: 'text',
    ignoreEvent: true,
    attrs: { x: midX, y, text, align: 'center', baseline },
    styles: {
      color: '#ffffff',
      size: 11,
      family: 'inherit',
      backgroundColor: color,
      paddingLeft: 6,
      paddingRight: 6,
      paddingTop: 3,
      paddingBottom: 3,
      borderRadius: 4
    }
  });

  return [
    {
      type: 'polygon',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] },
      styles: { style: 'fill', color: fillOf(color, 0.14) }
    },
    { type: 'line', attrs: { coordinates: [{ x: midX, y: up ? y1 : y0 }, { x: midX, y: up ? y0 : y1 }] }, styles: { color, size: 1 } },
    pill(up ? y0 - 22 : y1 + 4, line1, 'top'),
    ...(line2 ? [pill(up ? y0 - 4 : y1 + 22, line2, 'top')] : [])
  ];
}

export function registerMeasure(): void {
  defineTool({
    name: NAME,
    totalStep: 3, // 2 points
    needDefaultPointFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const MEASURE = NAME;
