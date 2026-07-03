'use client';

import { useEffect, useRef, useState } from 'react';
import { MousePointer2, Trash2, Star, ChevronRight, ChevronLeft, Magnet, Pin, Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import { useChartStore, useActiveChart } from '@/store/chartStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useDrawingsStore } from '@/store/drawingsStore';
import { useToolbarStore } from '@/store/toolbarStore';
import { useDrawingDefaultsStore } from '@/store/drawingDefaultsStore';
import { createPersistentOverlay, magnetToMode, overrideSavedOverlays } from '@/lib/overlays';
import { TOOLS, TOOL_GROUPS, toolById, registerToolOverlays, type ToolDef, type ToolGroup } from '@/lib/tools/registry';
import { registerHotkey, comboLabel } from '@/lib/hotkeys';
import { MenuPopover } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';
import { Kbd } from '@/components/ui/kbd';
import { confirm } from '@/components/ui/confirm';

/**
 * Left drawing toolbar, TradingView-style: cursor, pinned favorites, one
 * button per tool GROUP (click re-arms the group's last-used tool; the corner
 * chevron opens a flyout with favorite stars), then drawing modes (magnet
 * off/weak/strong, keep-drawing), the long/short order tool, and
 * lock-all / hide-all / clear-all. Tool metadata lives in lib/tools/registry.ts.
 */
export function DrawingToolbar() {
  const chart = useActiveChart();
  const charts = useChartStore((s) => s.charts);
  const activeTool = useChartStore((s) => s.activeTool);
  const setActiveTool = useChartStore((s) => s.setActiveTool);
  const activePaneId = useChartStore((s) => s.activePaneId);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);

  const favorites = useToolbarStore((s) => s.favorites);
  const lastUsed = useToolbarStore((s) => s.lastUsed);
  const magnet = useToolbarStore((s) => s.magnet);
  const keepDrawing = useToolbarStore((s) => s.keepDrawing);
  const lockAll = useToolbarStore((s) => s.lockAll);
  const hideAll = useToolbarStore((s) => s.hideAll);
  const toggleFavorite = useToolbarStore((s) => s.toggleFavorite);
  const setLastUsed = useToolbarStore((s) => s.setLastUsed);
  const cycleMagnet = useToolbarStore((s) => s.cycleMagnet);
  const toggleKeepDrawing = useToolbarStore((s) => s.toggleKeepDrawing);
  const setLockAll = useToolbarStore((s) => s.setLockAll);
  const setHideAll = useToolbarStore((s) => s.setHideAll);

  const [openGroup, setOpenGroup] = useState<ToolGroup | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const paneKey = activePaneId ? `${activeTabId}:${activePaneId}` : null;

  // The overlay currently being drawn (so Esc / re-arm can cancel it cleanly).
  const drawingId = useRef<string | null>(null);

  useEffect(() => {
    registerToolOverlays();
  }, []);

  const cancelDrawing = () => {
    if (drawingId.current && chart) chart.removeOverlay({ id: drawingId.current });
    drawingId.current = null;
    setActiveTool(null); // cursor (re-enables click-to-seek)
  };

  const arm = (t: ToolDef) => {
    if (!chart || !paneKey) return;
    if (drawingId.current) chart.removeOverlay({ id: drawingId.current }); // drop a half-drawn overlay
    setActiveTool(t.overlay);
    setLastUsed(t.group, t.id);
    setOpenGroup(null);
    const mode = magnetToMode(useToolbarStore.getState().magnet);

    if (t.ephemeral) {
      // Measure & co.: never persisted; dismissed on deselect (click elsewhere).
      drawingId.current = chart.createOverlay({
        name: t.overlay,
        mode,
        onDrawEnd: () => {
          setTimeout(() => setActiveTool(null), 0);
          return false;
        },
        onDeselected: (e) => {
          chart.removeOverlay({ id: e.overlay.id });
          if (drawingId.current === e.overlay.id) drawingId.current = null;
          return false;
        }
      }) as string | null;
      return;
    }

    // New drawings start from the tool's saved defaults (styles + e.g. fib levels).
    const defaults = useDrawingDefaultsStore.getState().defaults[t.overlay];
    drawingId.current = createPersistentOverlay(chart, paneKey, {
      name: t.overlay,
      styles: defaults?.styles,
      extendData: defaults?.extendData ? { ...defaults.extendData } : undefined,
      mode,
      onDone: () => {
        drawingId.current = null;
        // Deferred so the click that ends the drawing isn't also a seek.
        setTimeout(() => {
          if (useToolbarStore.getState().keepDrawing) armRef.current(t);
          else setActiveTool(null);
        }, 0);
      }
    });
  };

  // Hotkeys (stable registration; latest closures via refs, updated in an effect).
  const armRef = useRef(arm);
  const cancelRef = useRef(cancelDrawing);
  useEffect(() => {
    armRef.current = arm;
    cancelRef.current = cancelDrawing;
  });
  useEffect(() => {
    const unsubs = TOOLS.filter((t) => t.shortcut).map((t) =>
      registerHotkey(t.shortcut as string, t.label, 'Drawing', () => armRef.current(t))
    );
    unsubs.push(registerHotkey('escape', 'Cancel drawing / cursor', 'Drawing', () => cancelRef.current()));
    return () => unsubs.forEach((u) => u());
  }, []);

  // Mode toggles apply to existing drawings on the active tab too.
  const chartMap = () => Object.fromEntries(Object.entries(charts).map(([paneId, c]) => [paneId, c.chart]));
  const onMagnet = () => {
    cycleMagnet();
    overrideSavedOverlays(chartMap(), activeTabId, { mode: magnetToMode(useToolbarStore.getState().magnet) });
  };
  const onLockAll = () => {
    const next = !lockAll;
    setLockAll(next);
    overrideSavedOverlays(chartMap(), activeTabId, { lock: next });
  };
  const onHideAll = () => {
    const next = !hideAll;
    setHideAll(next);
    overrideSavedOverlays(chartMap(), activeTabId, { visible: !next });
  };

  const clearAll = async () => {
    if (!chart || !paneKey) return;
    if (!(await confirm({ title: 'Clear all drawings on this pane?', danger: true, confirmLabel: 'Clear all' }))) return;
    chart.removeOverlay();
    useDrawingsStore.getState().clear(paneKey);
  };

  const btnCls = (active: boolean) =>
    `flex h-8 w-8 items-center justify-center rounded transition disabled:opacity-40 ${
      active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
    }`;

  const toolTip = (t: ToolDef) => (
    <span className="flex items-center gap-1.5">
      {t.label}
      {t.shortcut && <Kbd>{comboLabel(t.shortcut)}</Kbd>}
    </span>
  );

  const favTools = favorites.map(toolById).filter((t): t is ToolDef => !!t);

  if (collapsed) {
    return (
      <div className="flex w-4 flex-col items-center border-r border-slate-800 bg-slate-900/60 py-2">
        <button
          type="button"
          aria-label="Expand drawing toolbar"
          title="Expand drawing toolbar"
          onClick={() => setCollapsed(false)}
          className="rounded text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-11 flex-col items-center gap-1 overflow-y-auto border-r border-slate-800 bg-slate-900/60 py-2">
      <button
        type="button"
        aria-label="Collapse drawing toolbar"
        title="Collapse drawing toolbar"
        onClick={() => setCollapsed(true)}
        className="rounded text-slate-500 hover:bg-slate-800 hover:text-white"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <Tooltip label="Cursor">
        <button type="button" onClick={cancelDrawing} className={btnCls(activeTool === null)}>
          <MousePointer2 className="h-4 w-4" />
        </button>
      </Tooltip>

      {favTools.length > 0 && (
        <>
          {favTools.map((t) => (
            <Tooltip key={t.id} label={toolTip(t)}>
              <button type="button" disabled={!chart} onClick={() => arm(t)} className={btnCls(activeTool === t.overlay)}>
                <t.Icon className="h-4 w-4" />
              </button>
            </Tooltip>
          ))}
          <div className="my-1 h-px w-6 bg-slate-700" />
        </>
      )}

      {TOOL_GROUPS.map((group) => {
        const tools = TOOLS.filter((t) => t.group === group);
        const current = tools.find((t) => t.id === lastUsed[group]) ?? tools[0];
        if (!current) return null;
        return (
          <div key={group} className="group relative">
            <Tooltip label={toolTip(current)}>
              <button
                type="button"
                disabled={!chart}
                onClick={() => arm(current)}
                className={btnCls(activeTool === current.overlay)}
              >
                <current.Icon className="h-4 w-4" />
              </button>
            </Tooltip>
            {tools.length > 1 && (
              <MenuPopover
                open={openGroup === group}
                onOpenChange={(o) => setOpenGroup(o ? group : null)}
                side="right"
                title={group}
                contentClassName="w-56 p-1.5"
                trigger={<ChevronRight className="h-3 w-3" />}
                triggerClassName="absolute -bottom-0.5 -right-0.5 rounded text-slate-500 opacity-0 transition hover:text-white group-hover:opacity-100"
              >
                {tools.map((t) => {
                  const fav = favorites.includes(t.id);
                  return (
                    <div key={t.id} className="flex items-center rounded hover:bg-slate-800/60">
                      <button
                        type="button"
                        onClick={() => arm(t)}
                        className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs text-slate-200"
                      >
                        <t.Icon className="h-3.5 w-3.5 text-slate-400" />
                        {t.label}
                        {t.shortcut && (
                          <span className="ml-auto">
                            <Kbd>{comboLabel(t.shortcut)}</Kbd>
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={fav ? `Unpin ${t.label}` : `Pin ${t.label} to toolbar`}
                        onClick={() => toggleFavorite(t.id)}
                        className="px-1.5"
                      >
                        <Star className={`h-3 w-3 ${fav ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-slate-400'}`} />
                      </button>
                    </div>
                  );
                })}
              </MenuPopover>
            )}
          </div>
        );
      })}

      <div className="my-1 h-px w-6 bg-slate-700" />

      <Tooltip label={`Magnet: ${magnet} (snaps points to OHLC)`}>
        <button type="button" onClick={onMagnet} className={btnCls(magnet !== 'off')}>
          <span className="relative">
            <Magnet className="h-4 w-4" />
            {magnet === 'strong' && <span className="absolute -right-1.5 -top-1 text-[8px] font-bold">S</span>}
          </span>
        </button>
      </Tooltip>

      <Tooltip label={`Keep drawing mode ${keepDrawing ? 'on' : 'off'} (tool stays armed)`}>
        <button type="button" onClick={toggleKeepDrawing} className={btnCls(keepDrawing)}>
          <Pin className="h-4 w-4" />
        </button>
      </Tooltip>

      <div className="my-1 h-px w-6 bg-slate-700" />

      <Tooltip label={lockAll ? 'Unlock all drawings' : 'Lock all drawings'}>
        <button type="button" disabled={!chart} onClick={onLockAll} className={btnCls(lockAll)}>
          {lockAll ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </button>
      </Tooltip>

      <Tooltip label={hideAll ? 'Show all drawings' : 'Hide all drawings'}>
        <button type="button" disabled={!chart} onClick={onHideAll} className={btnCls(hideAll)}>
          {hideAll ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </Tooltip>

      <Tooltip label="Clear all drawings (right-click a drawing to delete just it)">
        <button type="button" disabled={!chart} onClick={clearAll} className={btnCls(false)}>
          <Trash2 className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
