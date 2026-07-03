import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, lineStyleOf, fillOf } from '@/lib/tools/defineTool';

// User-drawn rectangle (2 corner points): translucent fill + border. The go-to
// tool for marking order blocks / FVG zones by hand. Color/width/style edit
// via the overlay context menu (styles.line), fill derives from the color.

const NAME = 'fx-rectangle';

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ];
  return [
    {
      type: 'polygon',
      attrs: { coordinates: corners },
      styles: { style: 'fill', color: fillOf(color) }
    },
    {
      type: 'polygon',
      attrs: { coordinates: corners },
      styles: { style: 'stroke', borderColor: color, borderSize: size, borderStyle: dashed ? 'dashed' : 'solid' }
    }
  ];
}

export function registerRectangle(): void {
  defineTool({
    name: NAME,
    totalStep: 3, // 2 points
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const RECTANGLE = NAME;
