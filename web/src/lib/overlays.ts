import { OverlayMode, type Chart, type OverlayEvent } from 'klinecharts';
import { useDrawingsStore, type SavedOverlay } from '@/store/drawingsStore';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useToolbarStore, type MagnetMode } from '@/store/toolbarStore';

// Create a KLineChart overlay wired to persist itself: it saves its points on
// draw/move end, removes itself from the store when removed, and removes on
// right-click. Used both for new drawings and for restoring saved ones.

/** Toolbar magnet setting → klinecharts overlay mode (native OHLC snapping). */
export function magnetToMode(magnet: MagnetMode): OverlayMode {
  if (magnet === 'weak') return OverlayMode.WeakMagnet;
  if (magnet === 'strong') return OverlayMode.StrongMagnet;
  return OverlayMode.Normal;
}

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
    mode?: OverlayMode;
    lock?: boolean;
    visible?: boolean;
    onDone?: () => void;
  }
): string | null {
  const save = persist(key);
  // Single-object create returns a single id (the array form isn't used here).
  return chart.createOverlay({
    name: opts.name,
    points: opts.points,
    id: opts.id,
    extendData: opts.extendData,
    styles: opts.styles,
    mode: opts.mode,
    lock: opts.lock,
    visible: opts.visible,
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
  }) as string | null;
}

/**
 * Re-create every saved overlay for `key` on a freshly mounted chart, applying
 * the current toolbar drawing state (magnet mode, lock-all, hide-all). A
 * drawing's own saved styles always win over tool defaults on restore.
 */
export function restoreOverlays(chart: Chart, key: string): void {
  const saved = useDrawingsStore.getState().drawings[key] ?? [];
  const tb = useToolbarStore.getState();
  for (const o of saved) {
    createPersistentOverlay(chart, key, {
      name: o.name,
      points: o.points,
      id: o.id,
      extendData: o.extendData,
      styles: o.styles,
      mode: magnetToMode(tb.magnet),
      lock: tb.lockAll || undefined,
      visible: tb.hideAll ? false : undefined
    });
  }
}

/**
 * Reconcile already-mounted charts to the current drawingsStore after a
 * Firestore hydrate: remove the previously-restored persisted overlays (by id,
 * so trade/ICT overlays are untouched) and re-create from the new store state.
 * `charts` maps paneId -> Chart; `prev` is the pre-hydrate drawings map.
 */
export function resyncOverlays(
  charts: Record<string, Chart>,
  tabId: string,
  prev: Record<string, SavedOverlay[]>
): void {
  for (const [paneId, chart] of Object.entries(charts)) {
    const key = `${tabId}:${paneId}`;
    for (const o of prev[key] ?? []) chart.removeOverlay({ id: o.id });
    restoreOverlays(chart, key);
  }
}

/**
 * Apply a patch (mode / lock / visible) to every SAVED overlay on the active
 * tab's panes — used by the toolbar's magnet / lock-all / hide-all toggles.
 * `charts` maps paneId -> Chart (from chartStore); keys are `${tabId}:${paneId}`.
 */
export function overrideSavedOverlays(
  charts: Record<string, Chart>,
  tabId: string,
  patch: { mode?: OverlayMode; lock?: boolean; visible?: boolean }
): void {
  const drawings = useDrawingsStore.getState().drawings;
  for (const [paneId, chart] of Object.entries(charts)) {
    for (const o of drawings[`${tabId}:${paneId}`] ?? []) {
      chart.overrideOverlay({ id: o.id, ...patch });
    }
  }
}
