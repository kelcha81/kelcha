import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// A single trade level (entry / SL / TP) as a full-width horizontal line plus a
// label box (price · pips · amount). Both figures are interactive, so the whole
// line AND the label are grab targets. TradeLines drives it from trading state
// and commits the new price on drag end (or locks it for a filled entry).

const NAME = 'positionLevel';
let registered = false;

interface Ext {
  color?: string;
  label?: string;
  labelSide?: 'top' | 'bottom' | 'middle'; // where the pill sits relative to the line
}

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 1) return [];
  const y = (coordinates[0] as { y: number }).y;
  const ext = (overlay.extendData ?? {}) as Ext;
  const color = ext.color ?? '#3b82f6';
  const right = bounding.width;

  const figs: OverlayFigure[] = [
    { type: 'line', attrs: { coordinates: [{ x: 0, y }, { x: right, y }] }, styles: { color, size: 1 } }
  ];
  if (ext.label) {
    figs.push({
      type: 'text',
      attrs: { x: 4, y, text: ext.label, align: 'left', baseline: ext.labelSide ?? 'middle' },
      styles: {
        color: '#ffffff',
        size: 11,
        family: 'inherit',
        backgroundColor: color,
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 3,
        paddingBottom: 3,
        borderRadius: 3
      }
    });
  }
  return figs;
}

export function registerPositionLevel(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: NAME,
    totalStep: 2, // 1 point + finish
    needDefaultPointFigure: false, // the line + label are the drag targets
    needDefaultYAxisFigure: true, // show the price on the y-axis
    createPointFigures: figures
  });
}

export const POSITION_LEVEL = NAME;
