import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, lineStyleOf, fillOf } from '@/lib/tools/defineTool';

// Geometric shapes: circle (centre + edge) and triangle (3 corners). Stroke +
// translucent fill; colour/width/style via the overlay context menu (line).

const CIRCLE_NAME = 'fx-circle';
const TRIANGLE_NAME = 'fx-triangle';

function circleFigures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const [c, edge] = coordinates as Array<{ x: number; y: number }>;
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  const r = Math.hypot(edge.x - c.x, edge.y - c.y);
  return [
    { type: 'circle', attrs: { x: c.x, y: c.y, r }, styles: { style: 'fill', color: fillOf(color) } },
    { type: 'circle', attrs: { x: c.x, y: c.y, r }, styles: { style: 'stroke', borderColor: color, borderSize: size, borderStyle: dashed ? 'dashed' : 'solid' } }
  ];
}

function triangleFigures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 3) return [];
  const pts = (coordinates as Array<{ x: number; y: number }>).slice(0, 3);
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  return [
    { type: 'polygon', attrs: { coordinates: pts }, styles: { style: 'fill', color: fillOf(color) } },
    { type: 'polygon', attrs: { coordinates: pts }, styles: { style: 'stroke', borderColor: color, borderSize: size, borderStyle: dashed ? 'dashed' : 'solid' } }
  ];
}

export function registerCircle(): void {
  defineTool({ name: CIRCLE_NAME, totalStep: 3, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: circleFigures });
}
export function registerTriangle(): void {
  defineTool({ name: TRIANGLE_NAME, totalStep: 4, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: triangleFigures });
}

export const CIRCLE = CIRCLE_NAME;
export const TRIANGLE = TRIANGLE_NAME;
