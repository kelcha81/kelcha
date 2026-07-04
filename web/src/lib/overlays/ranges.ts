import type { OverlayCreateFiguresCallbackParams, OverlayFigure } from 'klinecharts';
import { defineTool, fillOf } from '@/lib/tools/defineTool';
import { activePrecision } from '@/lib/overlays/fibTool';

// Persisted range measurers (unlike the ephemeral Shift+M measure): date range
// (bars + elapsed time), price range (Δprice/pips/%), and date+price range
// (both). 2 points each; blue shaded band + a pill.

const COLOR = '#3b82f6';

function human(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function pill(x: number, y: number, text: string, align: string, baseline: string): OverlayFigure {
  return {
    type: 'text',
    ignoreEvent: true,
    attrs: { x, y, text, align, baseline },
    styles: { color: '#ffffff', size: 11, family: 'inherit', backgroundColor: COLOR, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, borderRadius: 4 }
  };
}

function band(coords: Array<{ x: number; y: number }>): OverlayFigure {
  return { type: 'polygon', ignoreEvent: true, attrs: { coordinates: coords }, styles: { style: 'fill', color: fillOf(COLOR, 0.12) } };
}

interface Which { date?: boolean; price?: boolean }

function makeFigures(which: Which) {
  return ({ overlay, coordinates, bounding }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
    if (coordinates.length < 2 || overlay.points.length < 2) return [];
    const [a, b] = coordinates as Array<{ x: number; y: number }>;
    const p0 = overlay.points[0];
    const p1 = overlay.points[1];
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = which.price ? Math.min(a.y, b.y) : 0;
    const y1 = which.price ? Math.max(a.y, b.y) : bounding.height;
    const left = which.date ? x0 : 0;
    const right = which.date ? x1 : bounding.width;

    const prec = activePrecision();
    const parts: string[] = [];
    if (which.date) {
      const bars = p0.dataIndex != null && p1.dataIndex != null ? Math.abs(p1.dataIndex - p0.dataIndex) : null;
      const dt = p0.timestamp != null && p1.timestamp != null ? Math.abs(p1.timestamp - p0.timestamp) : null;
      if (bars != null) parts.push(`${bars} bars`);
      if (dt != null) parts.push(human(dt));
    }
    if (which.price) {
      const dPrice = (p1.value ?? 0) - (p0.value ?? 0);
      const pips = dPrice * Math.pow(10, prec - 1);
      const pct = p0.value ? (dPrice / p0.value) * 100 : 0;
      parts.push(`${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(prec)} (${pips.toFixed(1)}p, ${pct.toFixed(2)}%)`);
    }

    const midX = (left + right) / 2;
    const labelY = which.price ? y0 - 4 : bounding.height / 2;
    return [
      band([{ x: left, y: y0 }, { x: right, y: y0 }, { x: right, y: y1 }, { x: left, y: y1 }]),
      pill(midX, labelY, parts.join(' · '), 'center', which.price ? 'bottom' : 'middle')
    ];
  };
}

const DATE = 'fx-dateRange';
const PRICE = 'fx-priceRange';
const DATE_PRICE = 'fx-datePriceRange';

export function registerRanges(): void {
  defineTool({ name: DATE, totalStep: 3, needDefaultPointFigure: false, needDefaultYAxisFigure: false, createPointFigures: makeFigures({ date: true }) });
  defineTool({ name: PRICE, totalStep: 3, needDefaultPointFigure: false, needDefaultYAxisFigure: false, createPointFigures: makeFigures({ price: true }) });
  defineTool({ name: DATE_PRICE, totalStep: 3, needDefaultPointFigure: false, needDefaultYAxisFigure: false, createPointFigures: makeFigures({ date: true, price: true }) });
}

export const DATE_RANGE = DATE;
export const PRICE_RANGE = PRICE;
export const DATE_PRICE_RANGE = DATE_PRICE;
