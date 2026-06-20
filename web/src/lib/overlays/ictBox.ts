import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// Read-only ICT zone box (fair value gap / order block). Spans from its start
// candle to either an end time (mitigation) or the right edge, between a top and
// bottom price. Locked, non-persisted — driven by backtest annotations.

const NAME = 'ictBox';
let registered = false;

interface Ext {
  color?: string;       // border / label colour
  fill?: string;        // translucent fill
  label?: string;
  open?: boolean;       // extend to the right edge (no end time)
  mitigated?: boolean;  // dim a zone price has already returned to
}

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const ext = (overlay.extendData ?? {}) as Ext;
  const left = Math.max(-2, a.x);
  const right = ext.open ? bounding.width : Math.max(b.x, a.x + 1);
  const yTop = Math.min(a.y, b.y);
  const yBot = Math.max(a.y, b.y);
  const color = ext.color ?? '#64748b';
  const fill = ext.fill ?? 'rgba(100,116,139,0.10)';

  const figs: OverlayFigure[] = [
    {
      type: 'polygon',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: left, y: yTop }, { x: right, y: yTop }, { x: right, y: yBot }, { x: left, y: yBot }] },
      styles: { style: 'fill', color: fill }
    },
    {
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: left, y: yTop }, { x: right, y: yTop }] },
      styles: { color, size: 1, style: ext.mitigated ? 'dashed' : 'solid' }
    },
    {
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: left, y: yBot }, { x: right, y: yBot }] },
      styles: { color, size: 1, style: ext.mitigated ? 'dashed' : 'solid' }
    }
  ];

  if (ext.label) {
    figs.push({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: left + 2, y: yTop, text: ext.label, align: 'left', baseline: 'bottom' },
      styles: { color: '#ffffff', size: 10, family: 'inherit', backgroundColor: color, paddingLeft: 4, paddingRight: 4, paddingTop: 1, paddingBottom: 1, borderRadius: 2 }
    });
  }
  return figs;
}

export function registerIctBox(): void {
  if (registered) return;
  registered = true;
  registerOverlay({ name: NAME, totalStep: 3, needDefaultPointFigure: false, needDefaultYAxisFigure: false, createPointFigures: figures });
}

export const ICT_BOX = NAME;
