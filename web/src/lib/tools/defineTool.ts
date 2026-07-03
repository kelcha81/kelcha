import { registerOverlay, type OverlayTemplate } from 'klinecharts';

// Factory for the app's custom drawing overlays (`fx-*`). Registration is
// idempotent (klinecharts registers globally; charts mount/unmount freely).
//
// This is the single injection point for cross-cutting drawing behavior:
// magnet snapping (performEventMoveForDrawing/PressedMove) and per-tool style
// defaults hook in here in the drawing power-UX phase — tools defined through
// defineTool pick them up without per-tool changes.

const registered = new Set<string>();

export function defineTool(template: OverlayTemplate): string {
  if (!registered.has(template.name)) {
    registered.add(template.name);
    registerOverlay(template);
  }
  return template.name;
}

/** Resolve the line style the context menu edits (styles.line.{color,size,style}). */
export function lineStyleOf(styles: unknown): { color: string; size: number; dashed: boolean } {
  const line = ((styles as { line?: { color?: string; size?: number; style?: string } })?.line ?? {});
  return {
    color: line.color ?? '#3b82f6',
    size: line.size ?? 1,
    dashed: line.style === 'dashed'
  };
}

/** Translucent fill derived from a hex color (falls back to slate). */
export function fillOf(color: string, alpha = 0.12): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return `rgba(100,116,139,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
