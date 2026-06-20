const FALLBACK = 'Arial, Helvetica, sans-serif';

/**
 * The app font (Geist Sans), resolved to a concrete family name for use on the
 * KLineChart canvas (canvas `font` can't resolve CSS vars). next/font sets
 * `--font-geist-sans` on <html> to the generated family name.
 */
export function getCanvasFont(): string {
  if (typeof document === 'undefined') return FALLBACK;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-geist-sans').trim();
  return v ? `${v}, ${FALLBACK}` : FALLBACK;
}
