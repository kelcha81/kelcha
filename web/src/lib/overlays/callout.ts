import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, lineStyleOf } from '@/lib/tools/defineTool';

// Callout (2 points): an anchor on the price action + a leader line to a text
// bubble. Text edited via the overlay context menu (extendData.text), leader
// and bubble tint via styles.line.color.

const NAME = 'fx-callout';

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const [anchor, box] = coordinates as Array<{ x: number; y: number }>;
  const { color, size } = lineStyleOf(overlay.styles);
  const text = ((overlay.extendData ?? {}) as { text?: string }).text || 'Callout';

  return [
    { type: 'line', attrs: { coordinates: [anchor, box] }, styles: { color, size, style: 'solid' } },
    {
      type: 'circle',
      ignoreEvent: true,
      attrs: { x: anchor.x, y: anchor.y, r: 2 + size },
      styles: { style: 'fill', color }
    },
    {
      type: 'text',
      attrs: { x: box.x, y: box.y, text, align: box.x >= anchor.x ? 'left' : 'right', baseline: 'middle' },
      styles: {
        color: '#ffffff',
        size: 12,
        family: 'inherit',
        backgroundColor: color,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
        borderRadius: 4
      }
    }
  ];
}

export function registerCallout(): void {
  defineTool({
    name: NAME,
    totalStep: 3, // 2 points
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const CALLOUT = NAME;
