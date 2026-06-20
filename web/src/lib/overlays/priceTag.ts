import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// A price-axis tag: a single colored pill at the right edge showing the price,
// with NO line across the chart. Used for trade levels (entry/SL/TP/pending) so
// they read like TradingView's axis labels and clear when the trade is removed.

const NAME = 'priceTag';
let registered = false;

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  const c = coordinates[0];
  if (!c) return [];
  const ext = (overlay.extendData ?? {}) as { color?: string; prec?: number };
  const value = overlay.points[0]?.value ?? 0;
  return [
    {
      type: 'text',
      ignoreEvent: true,
      attrs: { x: bounding.width - 2, y: c.y, text: value.toFixed(ext.prec ?? 5), align: 'right', baseline: 'middle' },
      styles: {
        color: '#ffffff',
        size: 10,
        family: 'inherit',
        backgroundColor: ext.color ?? '#3b82f6',
        paddingLeft: 5,
        paddingRight: 5,
        paddingTop: 2,
        paddingBottom: 2,
        borderRadius: 3
      }
    }
  ];
}

export function registerPriceTag(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: NAME,
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const PRICE_TAG = NAME;
