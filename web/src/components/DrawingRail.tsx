'use client';

import { useEffect } from 'react';
import {
  MousePointer2,
  TrendingUp,
  Minus,
  MoveUpRight,
  DollarSign,
  Ruler,
  Type,
  Target,
  Trash2,
  type LucideIcon
} from 'lucide-react';
import { useChartStore, useActiveChart } from '@/store/chartStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useDrawingsStore } from '@/store/drawingsStore';
import { createPersistentOverlay } from '@/lib/overlays';
import { registerPositionTool, POSITION_TOOL, syncPositionOrder } from '@/lib/overlays/positionTool';
import { registerFibTool, FIB_TOOL } from '@/lib/overlays/fibTool';
import { registerTextNote, TEXT_NOTE } from '@/lib/overlays/textNote';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useOrderToolStore } from '@/store/orderToolStore';

interface Tool {
  id: string;
  name: string;
  overlay: string | null; // KLineChart built-in overlay name; null = cursor
  Icon: LucideIcon;
}

const TOOLS: Tool[] = [
  { id: 'cursor', name: 'Cursor', overlay: null, Icon: MousePointer2 },
  { id: 'segment', name: 'Trend line', overlay: 'segment', Icon: TrendingUp },
  { id: 'horizontal', name: 'Horizontal line', overlay: 'horizontalStraightLine', Icon: Minus },
  { id: 'ray', name: 'Ray', overlay: 'rayLine', Icon: MoveUpRight },
  { id: 'price', name: 'Price line', overlay: 'priceLine', Icon: DollarSign },
  { id: 'fib', name: 'Fibonacci', overlay: FIB_TOOL, Icon: Ruler },
  { id: 'text', name: 'Text note', overlay: TEXT_NOTE, Icon: Type }
];

export function DrawingRail() {
  const chart = useActiveChart();
  const activeTool = useChartStore((s) => s.activeTool);
  const setActiveTool = useChartStore((s) => s.setActiveTool);
  const activePaneId = useChartStore((s) => s.activePaneId);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);

  const paneKey = activePaneId ? `${activeTabId}:${activePaneId}` : null;

  const startTool = (overlay: string | null) => {
    setActiveTool(overlay); // null => cursor (re-enables click-to-seek)
    if (overlay && chart && paneKey) {
      createPersistentOverlay(chart, paneKey, {
        name: overlay,
        // Deferred so the click that ends the drawing isn't also a seek.
        onDone: () => setTimeout(() => setActiveTool(null), 0)
      });
    }
  };

  // Register the custom position overlay once (global to all charts).
  useEffect(() => {
    registerPositionTool();
    registerFibTool();
    registerTextNote();
  }, []);

  // The position tool isn't a persisted drawing — it writes its levels into the
  // order composer so the panel's Buy/Sell commits it.
  const startPosition = () => {
    setActiveTool(POSITION_TOOL);
    if (chart) {
      chart.createOverlay({
        name: POSITION_TOOL,
        onRemoved: () => {
          // Clear the order composer so its axis tags vanish with the box.
          useOrderToolStore.getState().reset();
          return false;
        },
        onDrawEnd: (event) => {
          syncPositionOrder(event.overlay);
          setTimeout(() => setActiveTool(null), 0);
          return true;
        },
        onSelected: (event) => {
          useOverlayMenuStore.getState().setSelected({ chart, id: event.overlay.id, paneKey: null });
          return false;
        },
        onRightClick: (event) => {
          useOverlayMenuStore.getState().openMenu({ chart, overlay: event.overlay, paneKey: null });
          return true;
        }
      });
    }
  };

  const clearAll = () => {
    if (!chart || !paneKey) return;
    chart.removeOverlay();
    useDrawingsStore.getState().clear(paneKey);
  };

  return (
    <div className="flex w-11 flex-col items-center gap-1 border-r border-slate-800 bg-slate-900/60 py-2">
      {TOOLS.map(({ id, name, overlay, Icon }) => {
        const active = activeTool === overlay;
        return (
          <button
            key={id}
            type="button"
            title={name}
            disabled={!chart}
            onClick={() => startTool(overlay)}
            className={`flex h-8 w-8 items-center justify-center rounded transition disabled:opacity-40 ${
              active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}

      <div className="my-1 h-px w-6 bg-slate-700" />

      <button
        type="button"
        title="Position tool (entry → stop → target; fills the order ticket)"
        disabled={!chart}
        onClick={startPosition}
        className={`flex h-8 w-8 items-center justify-center rounded transition disabled:opacity-40 ${
          activeTool === POSITION_TOOL ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
        }`}
      >
        <Target className="h-4 w-4" />
      </button>

      <div className="my-1 h-px w-6 bg-slate-700" />

      <button
        type="button"
        title="Clear all drawings (right-click a drawing to delete just it)"
        disabled={!chart}
        onClick={clearAll}
        className="flex h-8 w-8 items-center justify-center rounded text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
