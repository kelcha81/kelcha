'use client';

import { useRef, type ReactNode } from 'react';
import { SkipForward, Minus, Type, Camera, Scale, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useChartStore } from '@/store/chartStore';
import { useReplayStore } from '@/store/replayStore';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useDrawingsStore } from '@/store/drawingsStore';
import { useToolbarStore } from '@/store/toolbarStore';
import { createPersistentOverlay, overrideSavedOverlays } from '@/lib/overlays';
import { TEXT_NOTE } from '@/lib/overlays/textNote';
import { capturePane } from '@/lib/chartShot';
import { confirm } from '@/components/ui/confirm';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';

/**
 * Right-click menu for the chart itself (Radix ContextMenu wrapping a pane).
 * A right-click on a SELECTED overlay routes to the overlay's own menu
 * (settings/clone/lock); anywhere else opens chart actions at the cursor's
 * price/time: move the replay head, drop a line/note, log scale, screenshot,
 * hide/clear drawings.
 */
export function ChartContextMenu({ tabId, paneId, symbol, children }: { tabId: string; paneId: string; symbol: string; children: ReactNode }) {
  const hideAll = useToolbarStore((s) => s.hideAll);
  const point = useRef<{ price: number | null; ts: number | null }>({ price: null, ts: null });
  const paneKey = `${tabId}:${paneId}`;

  const chartOf = () => useChartStore.getState().charts[paneId]?.chart ?? null;

  // Capture phase: resolve the chart point under the cursor BEFORE Radix opens,
  // and short-circuit to the overlay menu when an overlay is selected.
  const onContextMenuCapture = (ev: React.MouseEvent) => {
    const pc = useChartStore.getState().charts[paneId];
    if (!pc) return;
    useChartStore.getState().setActivePane(paneId);
    const rect = pc.container.getBoundingClientRect();
    const res = pc.chart.convertFromPixel([{ x: ev.clientX - rect.left, y: ev.clientY - rect.top }], { paneId: 'candle_pane' });
    const p = Array.isArray(res) ? res[0] : res;
    point.current = {
      price: typeof p?.value === 'number' ? p.value : null,
      ts: typeof p?.timestamp === 'number' ? p.timestamp : null
    };
    const sel = useOverlayMenuStore.getState().selected;
    if (sel && sel.chart === pc.chart) {
      const ov = sel.chart.getOverlayById(sel.id);
      if (ov) {
        ev.preventDefault();
        ev.stopPropagation(); // keep Radix closed; the overlay menu owns this click
        useOverlayMenuStore.getState().openMenu({ chart: sel.chart, overlay: ov, paneKey: sel.paneKey });
        return;
      }
    }
  };

  const moveHead = () => {
    if (point.current.ts != null) useReplayStore.getState().setTimestamp(point.current.ts);
  };

  const addHorizontal = () => {
    const chart = chartOf();
    if (!chart || point.current.price == null) return;
    createPersistentOverlay(chart, paneKey, {
      name: 'horizontalStraightLine',
      points: [{ value: point.current.price, ...(point.current.ts != null ? { timestamp: point.current.ts } : {}) }]
    });
  };

  const addNote = () => {
    const chart = chartOf();
    if (!chart || point.current.price == null || point.current.ts == null) return;
    createPersistentOverlay(chart, paneKey, {
      name: TEXT_NOTE,
      points: [{ timestamp: point.current.ts, value: point.current.price }],
      extendData: { text: 'Note' }
    });
  };

  const isLog = () => chartOf()?.getStyles().yAxis.type === 'log';
  const toggleLog = () => {
    const chart = chartOf();
    if (!chart) return;
    chart.setStyles({ yAxis: { type: isLog() ? 'normal' : 'log' } } as never);
  };

  const screenshot = () => {
    const url = capturePane(paneId);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.png`;
    a.click();
  };

  const toggleHideAll = () => {
    const next = !useToolbarStore.getState().hideAll;
    useToolbarStore.getState().setHideAll(next);
    const charts = Object.fromEntries(
      Object.entries(useChartStore.getState().charts).map(([id, c]) => [id, c.chart])
    );
    overrideSavedOverlays(charts, tabId, { visible: !next });
  };

  const clearDrawings = async () => {
    const chart = chartOf();
    if (!chart) return;
    if (!(await confirm({ title: 'Clear all drawings on this pane?', danger: true, confirmLabel: 'Clear all' }))) return;
    chart.removeOverlay();
    useDrawingsStore.getState().clear(paneKey);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative min-h-0 flex-1" onContextMenuCapture={onContextMenuCapture}>
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={SkipForward} label="Move replay head here" onSelect={moveHead} />
        <ContextMenuSeparator />
        <ContextMenuItem icon={Minus} label="Add horizontal line" onSelect={addHorizontal} />
        <ContextMenuItem icon={Type} label="Add note here" onSelect={addNote} />
        <ContextMenuSeparator />
        <ContextMenuItem icon={Scale} label={`Log scale ${isLog() ? '✓' : ''}`} onSelect={toggleLog} />
        <ContextMenuItem icon={Camera} label="Save screenshot" onSelect={screenshot} />
        <ContextMenuSeparator />
        <ContextMenuItem
          icon={hideAll ? Eye : EyeOff}
          label={hideAll ? 'Show all drawings' : 'Hide all drawings'}
          onSelect={toggleHideAll}
        />
        <ContextMenuItem icon={Trash2} label="Clear drawings…" onSelect={clearDrawings} danger />
      </ContextMenuContent>
    </ContextMenu>
  );
}
