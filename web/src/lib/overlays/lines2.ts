import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, lineStyleOf } from '@/lib/tools/defineTool';
import { activePrecision } from '@/lib/overlays/fibTool';

// Trend angle (segment + on-screen angle°), info line (segment + length: bars /
// Δprice / pips), and pitchfork (median line + two parallel tines).

const TREND_ANGLE = 'fx-trendAngle';
const INFO_LINE = 'fx-infoLine';
const PITCHFORK = 'fx-pitchfork';

function label(x: number, y: number, text: string, color: string): OverlayFigure {
  return {
    type: 'text',
    ignoreEvent: true,
    attrs: { x, y, text, align: 'left', baseline: 'bottom' },
    styles: { color: '#ffffff', size: 10, family: 'inherit', backgroundColor: color, paddingLeft: 4, paddingRight: 4, paddingTop: 1, paddingBottom: 1, borderRadius: 2 }
  };
}

function trendAngleFigures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  const deg = (Math.atan2(a.y - b.y, b.x - a.x) * 180) / Math.PI; // screen angle (y up)
  return [
    { type: 'line', attrs: { coordinates: [a, b] }, styles: { color, size, style: dashed ? 'dashed' : 'solid' } },
    label(b.x + 4, b.y, `${deg.toFixed(1)}°`, color)
  ];
}

function infoLineFigures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2 || overlay.points.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  const p0 = overlay.points[0];
  const p1 = overlay.points[1];
  const prec = activePrecision();
  const dPrice = (p1.value ?? 0) - (p0.value ?? 0);
  const pips = dPrice * Math.pow(10, prec - 1);
  const bars = p0.dataIndex != null && p1.dataIndex != null ? Math.abs(p1.dataIndex - p0.dataIndex) : null;
  const text = `${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(prec)} (${pips.toFixed(1)}p)${bars != null ? ` · ${bars} bars` : ''}`;
  return [
    { type: 'line', attrs: { coordinates: [a, b] }, styles: { color, size, style: dashed ? 'dashed' : 'solid' } },
    label((a.x + b.x) / 2, (a.y + b.y) / 2, text, color)
  ];
}

function pitchforkFigures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 3) return [];
  const [p0, p1, p2] = coordinates as Array<{ x: number; y: number }>;
  const { color, size } = lineStyleOf(overlay.styles);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const dx = mid.x - p0.x;
  const dy = mid.y - p0.y;
  // Extend a ray from `start` along (dx,dy) to the right edge.
  const extend = (start: { x: number; y: number }) => {
    if (dx === 0) return { x: start.x, y: bounding.height };
    const t = (bounding.width - start.x) / dx;
    return { x: bounding.width, y: start.y + t * dy };
  };
  const stroke = { color, size, style: 'solid' as const };
  return [
    { type: 'line', attrs: { coordinates: [p1, p2] }, styles: { ...stroke, style: 'dashed' } }, // base
    { type: 'line', attrs: { coordinates: [p0, extend(p0)] }, styles: stroke }, // median
    { type: 'line', attrs: { coordinates: [p1, extend(p1)] }, styles: stroke }, // upper tine
    { type: 'line', attrs: { coordinates: [p2, extend(p2)] }, styles: stroke } // lower tine
  ];
}

export function registerLines2(): void {
  defineTool({ name: TREND_ANGLE, totalStep: 3, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: trendAngleFigures });
  defineTool({ name: INFO_LINE, totalStep: 3, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: infoLineFigures });
  defineTool({ name: PITCHFORK, totalStep: 4, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: pitchforkFigures });
}

export const TREND_ANGLE_TOOL = TREND_ANGLE;
export const INFO_LINE_TOOL = INFO_LINE;
export const PITCHFORK_TOOL = PITCHFORK;
