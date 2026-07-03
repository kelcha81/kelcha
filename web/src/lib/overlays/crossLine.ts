import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, lineStyleOf } from '@/lib/tools/defineTool';

// Cross line (1 point): a horizontal + vertical line through the point,
// spanning the whole pane — TradingView's "Cross Line" tool.

const NAME = 'fx-crossLine';

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  const c = coordinates[0];
  if (!c) return [];
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  const styles = { color, size, style: dashed ? 'dashed' : 'solid' };
  return [
    { type: 'line', attrs: { coordinates: [{ x: 0, y: c.y }, { x: bounding.width, y: c.y }] }, styles },
    { type: 'line', attrs: { coordinates: [{ x: c.x, y: 0 }, { x: c.x, y: bounding.height }] }, styles }
  ];
}

export function registerCrossLine(): void {
  defineTool({
    name: NAME,
    totalStep: 2, // 1 point
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const CROSS_LINE = NAME;
