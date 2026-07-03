import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool } from '@/lib/tools/defineTool';
import { fibColor, activePrecision } from '@/lib/overlays/fibTool';

// Trend-based Fib extension (3 points): A→B defines the impulse, C is where
// the projection starts; levels at C + (B−A)×ratio, drawn from C to the right
// edge. Ratios editable per overlay via extendData.levels (context menu).

const NAME = 'fx-fibExtension';

export const DEFAULT_EXT_RATIOS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618];

function ratios(extendData: unknown): number[] {
  const levels = (extendData as { levels?: unknown } | undefined)?.levels;
  return Array.isArray(levels) && levels.length > 0 && levels.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (levels as number[])
    : DEFAULT_EXT_RATIOS;
}

function figures({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const pts = coordinates as Array<{ x: number; y: number }>;
  const figs: OverlayFigure[] = [];

  // Impulse + retracement guides while drawing / after placement.
  figs.push({
    type: 'line',
    attrs: { coordinates: pts.slice(0, Math.min(3, pts.length)) },
    styles: { color: '#64748b', size: 1, style: 'dashed' }
  });
  if (coordinates.length < 3 || overlay.points.length < 3) return figs;

  const [a, b, c] = pts;
  const v0 = overlay.points[0].value ?? 0;
  const v1 = overlay.points[1].value ?? 0;
  const v2 = overlay.points[2].value ?? 0;
  const prec = activePrecision();
  // y-per-price from the A→B segment (guards zero range).
  const scale = v1 !== v0 ? (b.y - a.y) / (v1 - v0) : 0;

  for (const r of ratios(overlay.extendData)) {
    const price = v2 + (v1 - v0) * r;
    const y = c.y + (price - v2) * scale;
    const color = fibColor(r);
    figs.push({
      type: 'line',
      attrs: { coordinates: [{ x: c.x, y }, { x: bounding.width, y }] },
      styles: { color, size: 1 }
    });
    figs.push({
      type: 'text',
      ignoreEvent: true,
      attrs: { x: c.x + 2, y: y - 1, text: `${r} (${price.toFixed(prec)})`, align: 'left', baseline: 'bottom' },
      styles: { color, size: 10, family: 'inherit' }
    });
  }
  return figs;
}

export function registerFibExtension(): void {
  defineTool({
    name: NAME,
    totalStep: 4, // 3 points
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const FIB_EXTENSION = NAME;
