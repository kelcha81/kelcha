import type { Chart, OverlayEvent } from 'klinecharts';
import { useDrawingsStore, type SavedOverlay } from '@/store/drawingsStore';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';

// Create a KLineChart overlay wired to persist itself: it saves its points on
// draw/move end, removes itself from the store when removed, and removes on
// right-click. Used both for new drawings and for restoring saved ones.

function persist(key: string) {
  return (e: OverlayEvent): boolean => {
    const o = e.overlay;
    useDrawingsStore.getState().upsert(key, {
      id: o.id,
      name: o.name,
      points: o.points,
      extendData: o.extendData as Record<string, unknown> | undefined,
      styles: o.styles as Record<string, unknown> | undefined
    });
    return false;
  };
}

export function createPersistentOverlay(
  chart: Chart,
  key: string,
  opts: {
    name: string;
    points?: SavedOverlay['points'];
    id?: string;
    extendData?: Record<string, unknown>;
    styles?: Record<string, unknown>;
    onDone?: () => void;
  }
): void {
  const save = persist(key);
  chart.createOverlay({
    name: opts.name,
    points: opts.points,
    id: opts.id,
    extendData: opts.extendData,
    styles: opts.styles,
    onDrawEnd: (e) => {
      save(e);
      opts.onDone?.();
      return false;
    },
    onPressedMoveEnd: (e) => save(e),
    onRemoved: (e) => {
      useDrawingsStore.getState().remove(key, e.overlay.id);
      return false;
    },
    onSelected: (e) => {
      useOverlayMenuStore.getState().setSelected({ chart, id: e.overlay.id, paneKey: key });
      return false;
    },
    onRightClick: (e) => {
      useOverlayMenuStore.getState().openMenu({ chart, overlay: e.overlay, paneKey: key });
      return true;
    }
  });
}

/** Re-create every saved overlay for `key` on a freshly mounted chart. */
export function restoreOverlays(chart: Chart, key: string): void {
  const saved = useDrawingsStore.getState().drawings[key] ?? [];
  for (const o of saved) {
    createPersistentOverlay(chart, key, { name: o.name, points: o.points, id: o.id, extendData: o.extendData, styles: o.styles });
  }
}
