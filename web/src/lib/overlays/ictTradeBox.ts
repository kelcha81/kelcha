import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// Read-only bracket for the SELECTED backtest trade, drawn like the manual
// position tool: entry line + red stop zone + green target zone, with Stop /
// Target / R-R+Qty pills. Spans from the entry candle to the exit candle (with a
// minimum width so short trades stay visible). Points: [entry, exit, sl, tp].

const NAME = 'ictTradeBox';
let registered = false;

interface Ext {
  side?: string;
  hasSl?: boolean;
  hasTp?: boolean;
  qty?: number;
  prec?: number;
  pnl?: number;
}

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 4 || overlay.points.length < 4) return [];
  const [e, x, s, t] = coordinates as Array<{ x: number; y: number }>;
  const left = Math.min(e.x, x.x);
  let right = Math.max(e.x, x.x);
  if (right - left < 200) right = left + 240; // keep short trades visible

  const ext = (overlay.extendData ?? {}) as Ext;
  const entry = overlay.points[0].value ?? 0;
  const stop = overlay.points[2].value ?? 0;
  const target = overlay.points[3].value ?? 0;
  const prec = ext.prec ?? 5;
  const qty = ext.qty ?? 0;
  const pip = Math.pow(10, prec - 1);
  const side = ext.side === 'short' ? 'SHORT' : 'LONG';
  const riskDist = Math.abs(entry - stop);
  const rewardDist = Math.abs(target - entry);
  const rr = riskDist > 0 ? (rewardDist / riskDist).toFixed(2) : '—';
  const pnl = ext.pnl ?? 0;
  const pnlStr = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`;

  const figs: OverlayFigure[] = [];
  const zone = (y2: number, color: string) =>
    figs.push({
      type: 'polygon',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: left, y: e.y }, { x: right, y: e.y }, { x: right, y: y2 }, { x: left, y: y2 }] },
      styles: { style: 'fill', color }
    });
  const line = (y: number, color: string) =>
    figs.push({ type: 'line', ignoreEvent: true, attrs: { coordinates: [{ x: left, y }, { x: right, y }] }, styles: { color } });
  const pill = (y: number, text: string, bg: string, baseline: string) =>
    figs.push({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: left, y, text, align: 'left', baseline },
      styles: { color: '#ffffff', size: 11, family: 'inherit', backgroundColor: bg, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, borderRadius: 4 }
    });

  // realized move in pips (signed by trade direction) — distinct from P&L currency
  const exitV = overlay.points[1].value ?? entry;
  const netPips = (ext.side === 'short' ? entry - exitV : exitV - entry) * pip;

  if (ext.hasTp) zone(t.y, 'rgba(22,163,74,0.12)');
  if (ext.hasSl) zone(s.y, 'rgba(220,38,38,0.12)');
  line(e.y, '#3b82f6');
  if (ext.hasSl) line(s.y, '#dc2626');
  if (ext.hasTp) line(t.y, '#16a34a');

  // entry pill: R/R, realized pips, and P&L (account currency) — clearly labelled
  pill(e.y, `${side}  R/R ${rr}  ${netPips >= 0 ? '+' : ''}${netPips.toFixed(1)}p  P&L ${pnlStr}`, '#3b82f6', 'middle');
  if (ext.hasSl)
    pill(s.y, `SL ${stop.toFixed(prec)}  ${(riskDist * pip).toFixed(1)}p  -${(riskDist * qty).toFixed(2)}`, '#dc2626', 'top');
  if (ext.hasTp)
    pill(t.y, `TP ${target.toFixed(prec)}  ${(rewardDist * pip).toFixed(1)}p  +${(rewardDist * qty).toFixed(2)}`, '#16a34a', 'bottom');

  return figs;
}

export function registerIctTradeBox(): void {
  if (registered) return;
  registered = true;
  registerOverlay({ name: NAME, totalStep: 5, needDefaultPointFigure: false, needDefaultYAxisFigure: true, createPointFigures: figures });
}

export const ICT_TRADE_BOX = NAME;
