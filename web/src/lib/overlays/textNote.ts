import { registerOverlay, type OverlayCreateFiguresCallbackParams, type OverlayFigure } from 'klinecharts';

// A free-text annotation: 1 point, renders the text from extendData.text. The
// text is edited via the overlay's right-click → Settings box, and persisted.

const NAME = 'textNote';
let registered = false;

function figures({ overlay, coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] {
  const c = coordinates[0];
  if (!c) return [];
  const text = ((overlay.extendData ?? {}) as { text?: string }).text || 'Text';
  const color = ((overlay.styles?.text ?? {}) as { color?: string }).color ?? '#e2e8f0';
  return [
    {
      type: 'text',
      attrs: { x: c.x, y: c.y, text, align: 'left', baseline: 'middle' },
      styles: { color, size: 13, family: 'inherit' }
    }
  ];
}

export function registerTextNote(): void {
  if (registered) return;
  registered = true;
  registerOverlay({
    name: NAME,
    totalStep: 2, // 1 point
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: false,
    createPointFigures: figures
  });
}

export const TEXT_NOTE = NAME;
