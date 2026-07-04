import type { Chart } from 'klinecharts';
import { useDrawingsStore } from '@/store/drawingsStore';
import { type ToolDefaults } from '@/store/drawingDefaultsStore';
import { useOrderToolStore } from '@/store/orderToolStore';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { overlaySnapshot, createPersistentOverlay } from '@/lib/overlays';
import { splitKey } from '@/lib/drawingsData';
import { computeVisible, type TfVisibility } from '@/lib/tfVisibility';
import type { Timeframe } from '@/store/replayStore';

// Every mutation you can perform on a selected drawing, in ONE place — so the
// context menu, floating toolbar, and settings dialog all behave identically.
// Each action reads the LIVE overlay (no stale refs) and persists the result.

export interface DrawingTarget {
  chart: Chart;
  overlayId: string;
  paneKey: string | null;
}

// Monotonic z-order counters (session-scoped; persisted zLevel keeps relative
// order across reloads).
let zTop = 100;
let zBottom = -100;

/** The timeframe of the pane a drawing lives on (for per-TF visibility). */
function paneTimeframe(paneKey: string | null): Timeframe | null {
  if (!paneKey) return null;
  const [tabId, paneId] = splitKey(paneKey);
  const tab = useWorkspaceStore.getState().tabs.find((t) => t.id === tabId);
  return tab?.layout.panes.find((p) => p.id === paneId)?.timeframe ?? null;
}

/** Style patch that recolors whatever figure types a tool uses. */
export function colorPatch(color: string): Record<string, unknown> {
  return { line: { color }, polygon: { color }, circle: { color }, arc: { color }, text: { color }, rect: { borderColor: color } };
}

export function drawingActions({ chart, overlayId, paneKey }: DrawingTarget) {
  const live = () => chart.getOverlayById(overlayId);
  const ext = () => ({ ...((live()?.extendData ?? {}) as Record<string, unknown>) });

  const persist = () => {
    if (!paneKey) return;
    const o = live();
    if (o) useDrawingsStore.getState().upsert(paneKey, overlaySnapshot(o));
  };
  const override = (patch: Record<string, unknown>) => {
    chart.overrideOverlay({ id: overlayId, ...patch });
    persist();
  };

  return {
    live,
    persist,
    override,
    setColor: (color: string) => override({ styles: colorPatch(color) }),
    setWidth: (size: number) => override({ styles: { line: { size } } }),
    setLineStyle: (style: 'solid' | 'dashed') => override({ styles: { line: { style } } }),
    setText: (text: string) => override({ extendData: { ...ext(), text } }),
    setLevels: (levels: number[]) => override({ extendData: { ...ext(), levels } }),
    setExtend: (patch: Record<string, unknown>) => override({ extendData: { ...ext(), ...patch } }),
    setPoint: (i: number, value: number) => {
      const pts = live()?.points ?? [];
      override({ points: pts.map((p, j) => (j === i ? { ...p, value } : p)) });
    },

    toggleLock: () => override({ lock: !live()?.lock }),
    isHidden: () => ext().hidden === true,
    getTfVisibility: () => ext().tfVisibility as TfVisibility | undefined,
    /** Hard hide/show (persisted in extendData; recomputes the live visible). */
    setHidden: (hidden: boolean) => {
      const e = { ...ext(), hidden };
      override({ extendData: e, visible: computeVisible(e, paneTimeframe(paneKey)) });
    },
    toggleHidden: () => {
      const e = { ...ext(), hidden: !(ext().hidden === true) };
      override({ extendData: e, visible: computeVisible(e, paneTimeframe(paneKey)) });
    },
    /** Per-timeframe visibility config; re-evaluates against this pane's TF. */
    setTfVisibility: (tfVisibility: TfVisibility) => {
      const e = { ...ext(), tfVisibility };
      override({ extendData: e, visible: computeVisible(e, paneTimeframe(paneKey)) });
    },
    bringToFront: () => override({ zLevel: ++zTop }),
    sendToBack: () => override({ zLevel: --zBottom }),

    clone: () => {
      const o = live();
      if (!o || !paneKey) return;
      createPersistentOverlay(chart, paneKey, {
        name: o.name,
        points: o.points.map((p) => ({ ...p })),
        extendData: o.extendData as Record<string, unknown> | undefined,
        styles: o.styles as Record<string, unknown> | undefined
      });
    },

    remove: () => {
      chart.removeOverlay({ id: overlayId });
      if (paneKey) useDrawingsStore.getState().remove(paneKey, overlayId);
      if (useOverlayMenuStore.getState().selected?.id === overlayId) useOverlayMenuStore.getState().setSelected(null);
    },

    /** Load a position drawing's entry/stop/target into the order ticket. */
    applyToTicket: () => {
      const o = live();
      if (!o) return;
      const tool = useOrderToolStore.getState();
      const [entry, sl, tp] = o.points;
      if (entry?.value != null) tool.setValue('entry', entry.value);
      if (sl?.value != null) tool.setValue('sl', sl.value);
      if (tp?.value != null) tool.setValue('tp', tp.value);
    },

    /** Snapshot styles + non-content extendData (e.g. fib levels) as reusable. */
    snapshotDefaults: (): ToolDefaults => {
      const o = live();
      const e = { ...((o?.extendData ?? {}) as Record<string, unknown>) };
      delete e.text; // content is never part of a style default/template
      return {
        styles: (o?.styles as Record<string, unknown> | null) ?? undefined,
        extendData: Object.keys(e).length ? e : undefined
      };
    },
    applyDefaults: (d: ToolDefaults) => {
      override({ styles: d.styles ?? {}, extendData: { ...ext(), ...(d.extendData ?? {}) } });
    }
  };
}
