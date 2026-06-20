import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayEvent, type OverlayFigure } from 'klinecharts';
import { useOrderToolStore } from '@/store/orderToolStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { getSymbolInfo } from '@/lib/symbols';

// A draggable "Position" overlay: 3 points = entry, stop, target. It renders the
// classic risk/reward box (red stop zone, green target zone, R:R label) and
// writes its levels into the order composer, so the panel's Buy/Sell commits it.

const NAME = 'positionTool';

export function syncPositionOrder(overlay: OverlayEvent['overlay']): void {
  const p = overlay.points;
  const tool = useOrderToolStore.getState();
  if (p[0]?.value != null) tool.setValue('entry', p[0].value);
  if (p[1]?.value != null) tool.setValue('sl', p[1].value);
  if (p[2]?.value != null) tool.setValue('tp', p[2].value);
}

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 3 || overlay.points.length < 3) return [];
  const [e, s, t] = coordinates as Array<{ x: number; y: number }>;
  const left = Math.min(e.x, s.x, t.x);
  let right = Math.max(e.x, s.x, t.x);
  if (right - left < 200) right = left + 240;
  const midX = (left + right) / 2;

  const entry = overlay.points[0].value ?? 0;
  const stop = overlay.points[1].value ?? 0;
  const target = overlay.points[2].value ?? 0;

  // Lots from the order ticket + contract specs of the active symbol → qty/amounts.
  const lots = useOrderToolStore.getState().lots;
  const ws = useWorkspaceStore.getState();
  const info = getSymbolInfo(ws.tabs.find((tb) => tb.id === ws.activeTabId)?.symbol ?? 'eurusd');
  const prec = info.pricePrecision;
  const qty = lots * info.contractSize;
  const pip = Math.pow(10, prec - 1);

  const riskDist = Math.abs(entry - stop);
  const rewardDist = Math.abs(target - entry);
  const rr = riskDist > 0 ? (rewardDist / riskDist).toFixed(2) : '—';
  const tgtPct = entry ? (rewardDist / entry) * 100 : 0;
  const stopPct = entry ? (riskDist / entry) * 100 : 0;

  const zone = (y2: number, color: string): OverlayFigure => ({
    type: 'polygon',
    ignoreEvent: true,
    attrs: { coordinates: [{ x: left, y: e.y }, { x: right, y: e.y }, { x: right, y: y2 }, { x: left, y: y2 }] },
    styles: { style: 'fill', color }
  });
  const line = (y: number, color: string): OverlayFigure => ({
    type: 'line',
    attrs: { coordinates: [{ x: left, y }, { x: right, y }] },
    styles: { color }
  });
  const pill = (x: number, y: number, text: string, bg: string, align: string, baseline: string): OverlayFigure => ({
    type: 'text',
    attrs: { x, y, text, align, baseline },
    styles: { color: '#ffffff', size: 11, family: 'inherit', backgroundColor: bg, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, borderRadius: 4 }
  });

  return [
    zone(t.y, 'rgba(22,163,74,0.12)'),
    zone(s.y, 'rgba(220,38,38,0.12)'),
    line(e.y, '#3b82f6'),
    line(s.y, '#dc2626'),
    line(t.y, '#16a34a'),
    pill(left, t.y, `Target ${target.toFixed(prec)} (${tgtPct.toFixed(2)}%) ${(rewardDist * pip).toFixed(1)}, Amount: ${(rewardDist * qty).toFixed(2)}`, '#16a34a', 'left', 'bottom'),
    pill(midX, e.y, `R/R ${rr}, Qty: ${Math.round(qty)}`, '#3b82f6', 'center', 'middle'),
    pill(left, s.y, `Stop ${stop.toFixed(prec)} (${stopPct.toFixed(2)}%) ${(riskDist * pip).toFixed(1)}, Amount: ${(riskDist * qty).toFixed(2)}`, '#dc2626', 'left', 'top')
  ];
}

let registered = false;

export function registerPositionTool(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: NAME,
    totalStep: 4, // 3 points + finish
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: figures,
    onDrawEnd: (e: OverlayEvent) => {
      syncPositionOrder(e.overlay);
      return true;
    },
    onPressedMoveEnd: (e: OverlayEvent) => {
      syncPositionOrder(e.overlay);
      return true;
    }
  });
}

export const POSITION_TOOL = NAME;
