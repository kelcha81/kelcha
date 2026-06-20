import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// Read-only ICT price level: a horizontal line from its anchor time to the right
// edge, with a small left-aligned label. Used for liquidity pools/levels and the
// price of a structure break (BOS/MSS) or sweep. Locked, non-persisted.

const NAME = 'ictLevel';
let registered = false;

interface Ext {
  color?: string;
  label?: string;
  dashed?: boolean;
}

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 1) return [];
  const a = coordinates[0] as { x: number; y: number };
  const ext = (overlay.extendData ?? {}) as Ext;
  const left = Math.max(-2, a.x);
  const right = bounding.width;
  const color = ext.color ?? '#94a3b8';

  const figs: OverlayFigure[] = [
    {
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: left, y: a.y }, { x: right, y: a.y }] },
      styles: { color, size: 1, style: ext.dashed ? 'dashed' : 'solid' }
    }
  ];
  if (ext.label) {
    figs.push({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: left + 2, y: a.y, text: ext.label, align: 'left', baseline: 'bottom' },
      styles: { color, size: 10, family: 'inherit' }
    });
  }
  return figs;
}

export function registerIctLevel(): void {
  if (registered) return;
  registered = true;
  registerOverlay({ name: NAME, totalStep: 2, needDefaultPointFigure: false, needDefaultYAxisFigure: false, createPointFigures: figures });
}

export const ICT_LEVEL = NAME;
