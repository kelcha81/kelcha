import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { getSymbolInfo } from '@/lib/symbols';

// A bounded Fibonacci retracement: 2 points (start → end). Levels are drawn ONLY
// between the two points' x-range (not across the whole chart), like the
// position tool. Each level shows its ratio + price. Ratios are editable per
// overlay via extendData.levels (context menu → Settings → Levels).

const NAME = 'fibBounded';
let registered = false;

export const DEFAULT_FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const RATIO_COLORS: Record<string, string> = {
  '0': '#787b86',
  '0.236': '#f23645',
  '0.382': '#ff9800',
  '0.5': '#4caf50',
  '0.618': '#089981',
  '0.786': '#00bcd4',
  '1': '#787b86'
};

export function fibColor(r: number): string {
  return RATIO_COLORS[String(r)] ?? '#9aa7b4';
}

/** The overlay's ratio list: extendData.levels (edited via the menu) or defaults. */
export function fibRatios(extendData: unknown): number[] {
  const levels = (extendData as { levels?: unknown } | undefined)?.levels;
  return Array.isArray(levels) && levels.length > 0 && levels.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (levels as number[])
    : DEFAULT_FIB_RATIOS;
}

export function activePrecision(): number {
  const ws = useWorkspaceStore.getState();
  return getSymbolInfo(ws.tabs.find((t) => t.id === ws.activeTabId)?.symbol ?? 'eurusd').pricePrecision;
}

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2 || overlay.points.length < 2) return [];
  const [a, b] = coordinates as Array<{ x: number; y: number }>;
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);

  const v0 = overlay.points[0].value ?? 0; // start (ratio 1)
  const v1 = overlay.points[1].value ?? 0; // end (ratio 0)
  const prec = activePrecision();

  const figs: OverlayFigure[] = [];
  for (const r of fibRatios(overlay.extendData)) {
    const color = fibColor(r);
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
