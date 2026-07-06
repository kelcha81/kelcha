// Document-level grab / grabbing cursor for draggable chart overlays (trade
// levels + drawings). Toggled via a class on <body> with a CSS !important rule
// (globals.css) because klinecharts forces an inline `crosshair` on its own
// canvases that a scoped rule can't beat.

export type GrabCursor = 'grab' | 'grabbing' | null;

export function setGrabCursor(state: GrabCursor): void {
  const cls = document.body.classList;
  cls.remove('kx-grab', 'kx-grabbing');
  if (state === 'grab') cls.add('kx-grab');
  else if (state === 'grabbing') cls.add('kx-grabbing');
}
