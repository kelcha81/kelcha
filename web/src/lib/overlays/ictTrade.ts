import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// Read-only backtest trade: a segment from entry to exit, green for a winner,
// red for a loser, with side/exit-reason markers. Locked, non-persisted.

const NAME = 'ictTrade';
let registered = false;

interface Ext {
  win?: boolean;
  label?: string;
}

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const ext = (overlay.extendData ?? {}) as Ext;
  const color = ext.win ? '#16a34a' : '#dc2626';

  const figs: OverlayFigure[] = [
    {
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] },
      styles: { color, size: 1, style: 'dashed' }
    },
    // small entry tick
    {
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: a.x, y: a.y - 5 }, { x: a.x, y: a.y + 5 }] },
      styles: { color, size: 2 }
    }
  ];
  if (ext.label) {
    figs.push({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: b.x + 2, y: b.y, text: ext.label, align: 'left', baseline: 'middle' },
      styles: { color, size: 10, family: 'inherit' }
    });
  }
  return figs;
}

export function registerIctTrade(): void {
  if (registered) return;
  registered = true;
  registerOverlay({ name: NAME, totalStep: 3, needDefaultPointFigure: false, needDefaultYAxisFigure: false, createPointFigures: figures });
}

export const ICT_TRADE = NAME;
