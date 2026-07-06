import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// The shaded risk (entry→SL) and reward (entry→TP) zones for a LIVE
// order/position, spanning from the entry candle to the right edge. Locked,
// display-only, non-interactive (ignoreEvent). The interactive entry/SL/TP
// lines + labels are separate `positionLevel` overlays (TradeLines) so they
// can be grabbed anywhere across the chart.

const NAME = 'livePosition';
let registered = false;

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 3 || overlay.points.length < 3) return [];
  const [e, s, t] = coordinates as Array<{ x: number; y: number }>;
  const right = bounding.width;
  const left = Math.max(-2, Math.min(e.x, right - 60));

  const entry = overlay.points[0].value ?? 0;
  const stop = overlay.points[1].value ?? 0;
  const target = overlay.points[2].value ?? 0;
  const hasTp = overlay.points[2].value != null && target !== entry;
  const hasSl = overlay.points[1].value != null && stop !== entry;

  const figs: OverlayFigure[] = [];
  const zone = (y2: number, color: string) =>
    figs.push({
      type: 'polygon',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: left, y: e.y }, { x: right, y: e.y }, { x: right, y: y2 }, { x: left, y: y2 }] },
      styles: { style: 'fill', color }
    });

  if (hasTp) zone(t.y, 'rgba(22,163,74,0.10)');
  if (hasSl) zone(s.y, 'rgba(220,38,38,0.10)');
  return figs;
}

export function registerLivePosition(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: NAME,
    totalStep: 4,
    needDefaultPointFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: figures
  });
}

export const LIVE_POSITION = NAME;
