import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { getSymbolInfo } from '@/lib/symbols';

// A bounded Fibonacci retracement: 2 points (start → end). Levels are drawn ONLY
// between the two points' x-range (not across the whole chart), like the
// position tool. Each level shows its ratio + price.

const NAME = 'fibBounded';
let registered = false;

const LEVELS: { r: number; color: string }[] = [
  { r: 0, color: '#787b86' },
  { r: 0.236, color: '#f23645' },
  { r: 0.382, color: '#ff9800' },
  { r: 0.5, color: '#4caf50' },
  { r: 0.618, color: '#089981' },
  { r: 0.786, color: '#00bcd4' },
  { r: 1, color: '#787b86' }
];

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2 || overlay.points.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);

  const v0 = overlay.points[0].value ?? 0; // start (ratio 1)
  const v1 = overlay.points[1].value ?? 0; // end (ratio 0)
  const ws = useWorkspaceStore.getState();
  const prec = getSymbolInfo(ws.tabs.find((t) => t.id === ws.activeTabId)?.symbol ?? 'eurusd').pricePrecision;

  const figs: OverlayFigure[] = [];
  for (const { r, color } of LEVELS) {
    const y = b.y + (a.y - b.y) * r;
    const price = v1 + (v0 - v1) * r;
    figs.push({ type: 'line', attrs: { coordinates: [{ x: left, y }, { x: right, y }] }, styles: { color, size: 1 } });
    figs.push({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: left + 2, y: y - 1, text: `${r} (${price.toFixed(prec)})`, align: 'left', baseline: 'bottom' },
      styles: { color, size: 10, family: 'inherit' }
    });
  }
  return figs;
}

export function registerFibTool(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: NAME,
    totalStep: 3, // 2 points + finish
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: figures
  });
}

export const FIB_TOOL = NAME;
