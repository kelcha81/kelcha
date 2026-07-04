import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, lineStyleOf } from '@/lib/tools/defineTool';

// 1-point annotation markers: a flag on a pole and up/down arrow marks.

const FLAG = 'fx-flag';
const ARROW_UP = 'fx-arrowUp';
const ARROW_DOWN = 'fx-arrowDown';

function flagFigures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  const c = coordinates[0];
  if (!c) return [];
  const { color } = lineStyleOf(overlay.styles);
  const h = 16;
  const w = 12;
  return [
    { type: 'line', attrs: { coordinates: [{ x: c.x, y: c.y }, { x: c.x, y: c.y - h }] }, styles: { color, size: 2 } },
    {
      type: 'polygon',
      attrs: { coordinates: [{ x: c.x, y: c.y - h }, { x: c.x + w, y: c.y - h + 3 }, { x: c.x, y: c.y - h + 6 }] },
      styles: { style: 'fill', color }
    }
  ];
}

function arrow(dir: 'up' | 'down') {
  return ({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
    const c = coordinates[0];
    if (!c) return [];
    const { color } = lineStyleOf(overlay.styles);
    const s = 9;
    const gap = 6;
    // Arrow sits below the point (up) or above it (down), pointing at the price.
    const tipY = dir === 'up' ? c.y + gap : c.y - gap;
    const baseY = dir === 'up' ? tipY + s : tipY - s;
    return [
      {
        type: 'polygon',
        attrs: { coordinates: [{ x: c.x, y: tipY }, { x: c.x - s * 0.7, y: baseY }, { x: c.x + s * 0.7, y: baseY }] },
        styles: { style: 'fill', color }
      }
    ];
  };
}

export function registerMarkers(): void {
  defineTool({ name: FLAG, totalStep: 2, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: flagFigures });
  defineTool({ name: ARROW_UP, totalStep: 2, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: arrow('up') });
  defineTool({ name: ARROW_DOWN, totalStep: 2, needDefaultPointFigure: true, needDefaultYAxisFigure: false, createPointFigures: arrow('down') });
}

export const FLAG_TOOL = FLAG;
export const ARROW_UP_TOOL = ARROW_UP;
export const ARROW_DOWN_TOOL = ARROW_DOWN;
