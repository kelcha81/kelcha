import type { OverlayCreateFiguresCallbackParams, OverlayFigure, OverlayTemplate } from 'klinecharts';
import { defineTool, lineStyleOf } from '@/lib/tools/defineTool';

// Path and Curved line — TradingView-style multi-point line tools.
//
// klinecharts v9 overlays require a FIXED number of points (`totalStep`); there
// is no double-click-to-finish / variable-length drawing (that arrives in v10).
// So Path ships as fixed 2/3/4-leg variants (each a separate overlay), each a
// polyline with an arrowhead on the final leg — the ICT accumulation →
// manipulation → distribution projection. Curve is a 3-point quadratic bézier
// (start, end, then a point that sets the bend), matching TradingView's
// curved-trendline tool.

type Pt = { x: number; y: number };

const CURVE_NAME = 'fx-curve';

/** Arrowhead triangle at `b`, oriented along a→b (mirrors fx-arrow). */
function arrowHead(a: Pt, b: Pt, size: number): Pt[] {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const len = 8 + size * 3;
  const spread = Math.PI / 7;
  return [
    b,
    { x: b.x - len * Math.cos(angle - spread), y: b.y - len * Math.sin(angle - spread) },
    { x: b.x - len * Math.cos(angle + spread), y: b.y - len * Math.sin(angle + spread) }
  ];
}

function pathFigures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const pts = coordinates as Pt[];
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  const b = pts[pts.length - 1];
  const a = pts[pts.length - 2];
  return [
    { type: 'line', attrs: { coordinates: pts }, styles: { color, size, style: dashed ? 'dashed' : 'solid' } },
    { type: 'polygon', ignoreEvent: true, attrs: { coordinates: arrowHead(a, b, size) }, styles: { style: 'fill', color } }
  ];
}

/** A fixed-leg path overlay (`legs` segments = `legs + 1` points). */
function pathTemplate(name: string, legs: number): OverlayTemplate {
  return {
    name,
    totalStep: legs + 2, // (legs + 1) points, +1 for the finishing step
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: pathFigures
  };
}

function curveFigures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  if (coordinates.length < 2) return [];
  const pts = coordinates as Pt[];
  const { color, size, dashed } = lineStyleOf(overlay.styles);
  const style = { color, size, style: dashed ? ('dashed' as const) : ('solid' as const) };

  // Before the third (bend) point is placed, show a straight anchor line.
  if (pts.length < 3) return [{ type: 'line', attrs: { coordinates: pts }, styles: style }];

  // Points in click order: [start, end, control]. Sample the quadratic bézier
  // start → control → end into a fine polyline.
  const [start, end, control] = pts;
  const N = 28;
  const curve: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    curve.push({
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y
    });
  }
  return [{ type: 'line', attrs: { coordinates: curve }, styles: style }];
}

export function registerCurves(): void {
  // 'fx-path' stays the 3-leg overlay (unchanged name → existing drawings keep working).
  defineTool(pathTemplate(PATH2, 2));
  defineTool(pathTemplate(PATH3, 3));
  defineTool(pathTemplate(PATH4, 4));
  defineTool({
    name: CURVE_NAME,
    totalStep: 4, // 3 points (start, end, bend)
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: curveFigures
  });
}

export const PATH2 = 'fx-path2';
export const PATH3 = 'fx-path';
export const PATH4 = 'fx-path4';
export const CURVE = CURVE_NAME;
