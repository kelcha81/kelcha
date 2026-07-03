import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, lineStyleOf } from '@/lib/tools/defineTool';

// Arrow (2 points): a line with an arrowhead at the second point. Color/width
// via the overlay context menu (styles.line).

const NAME = 'fx-arrow';

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const { color, size, dashed } = lineStyleOf(overlay.styles);

  // Arrowhead: triangle at b, oriented along a→b.
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const len = 8 + size * 3;
  const spread = Math.PI / 7;
  const p1 = { x: b.x - len * Math.cos(angle - spread), y: b.y - len * Math.sin(angle - spread) };
  const p2 = { x: b.x - len * Math.cos(angle + spread), y: b.y - len * Math.sin(angle + spread) };

  return [
    {
      type: 'line',
      attrs: { coordinates: [a, b] },
      styles: { color, size, style: dashed ? 'dashed' : 'solid' }
    },
    {
      type: 'polygon',
      ignoreEvent: true,
      attrs: { coordinates: [b, p1, p2] },
      styles: { style: 'fill', color }
    }
  ];
}

export function registerArrow(): void {
  defineTool({
    name: NAME,
    totalStep: 3, // 2 points
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const ARROW = NAME;
