'use client';

import { useLayoutEffect, useState } from 'react';
import { Palette, Minus, Settings, Star, Copy, Lock, Unlock, Eye, EyeOff, Trash2, LayoutTemplate, Type } from 'lucide-react';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useChartStore } from '@/store/chartStore';
import { useDrawingDefaultsStore } from '@/store/drawingDefaultsStore';
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore';
import { drawingActions, type DrawingTarget } from '@/lib/drawingActions';
import { splitKey } from '@/lib/drawingsData';
import { TEXT_NOTE } from '@/lib/overlays/textNote';
import { CALLOUT } from '@/lib/overlays/callout';
import { MenuPopover } from '@/components/ui/menu';
import { Tooltip } from '@/components/ui/tooltip';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#a855f7', '#f97316', '#ffffff', '#64748b'];
const WIDTHS = [1, 2, 3, 4];
const btn = 'flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-white';

/**
 * TradingView-style floating "subtool" bar: appears at the top-center of the
 * pane when a drawing is selected, with quick color/width/style, templates,
 * default, clone, lock, hide, settings and delete — so common edits are one
 * click instead of buried in a right-click menu. Deselecting hides it.
 */
export function FloatingDrawingToolbar() {
  const selected = useOverlayMenuStore((s) => s.selected);
  const activePaneId = useChartStore((s) => s.activePaneId);
  const templatesByTool = useDrawingDefaultsStore((s) => s.templates);
  const [rev, setRev] = useState(0); // re-read the live overlay after an action
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const paneId = selected?.paneKey ? splitKey(selected.paneKey)[1] : activePaneId;
  const overlay = selected ? selected.chart.getOverlayById(selected.id) : null;

  // Anchor to the pane's top-center; recompute on selection, resize, layout.
  // No null-resets needed: rendering already guards on `selected && overlay && pos`.
  useLayoutEffect(() => {
    if (!selected || !paneId) return;
    const container = useChartStore.getState().charts[paneId]?.container;
    if (!container) return;
    const place = () => {
      const r = container.getBoundingClientRect();
      setPos({ top: r.top + 8, left: r.left + r.width / 2 });
    };
    // Measure-and-position in a layout effect is the documented React pattern;
    // deferring this first placement would paint one mispositioned frame.
     
    place();
    const ro = new ResizeObserver(place);
    ro.observe(container);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [selected, paneId, rev]);

  if (!selected || !overlay || !pos) return null;

  const target: DrawingTarget = { chart: selected.chart, overlayId: selected.id, paneKey: selected.paneKey };
  const a = drawingActions(target);
  const bump = () => setRev((r) => r + 1);
  const run = (fn: () => void) => {
    fn();
    bump();
  };

  const lineColor = ((overlay.styles as { line?: { color?: string } } | null)?.line?.color) ?? COLORS[0];
  const templates = templatesByTool[overlay.name] ?? {};
  const isText = overlay.name === TEXT_NOTE || overlay.name === CALLOUT;
  const hidden = ((overlay.extendData ?? {}) as { hidden?: boolean }).hidden === true;

  const openSettings = () =>
    useDrawingSettingsStore.getState().openSettings({ ...target, name: overlay.name });

  return (
    <div
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
      className="fixed z-[var(--z-menu)] flex items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-900/95 px-1 py-1 shadow-xl backdrop-blur"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Color */}
      <MenuPopover
        side="bottom"
        triggerClassName={btn}
        contentClassName="w-auto"
        trigger={
          <span className="relative">
            <Palette className="h-4 w-4" />
            <span className="absolute -bottom-0.5 left-1/2 h-1 w-3 -translate-x-1/2 rounded" style={{ background: lineColor }} />
          </span>
        }
      >
        <div className="flex w-40 flex-wrap gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => run(() => a.setColor(c))}
              style={{ background: c }}
              className="h-5 w-5 rounded-full border border-slate-600"
            />
          ))}
          <label className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-slate-600 text-[8px] text-slate-300">
            +
            <input type="color" value={lineColor} onChange={(e) => run(() => a.setColor(e.target.value))} className="sr-only" />
          </label>
        </div>
      </MenuPopover>

      {/* Width */}
      <MenuPopover side="bottom" triggerClassName={btn} contentClassName="w-auto" trigger={<Minus className="h-4 w-4" />}>
        <div className="flex flex-col gap-1">
          {WIDTHS.map((w) => (
            <button key={w} type="button" onClick={() => run(() => a.setWidth(w))} className="rounded px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
              {w}px
            </button>
          ))}
        </div>
      </MenuPopover>

      {/* Line style */}
      <Tooltip label="Line style">
        <button type="button" onClick={() => run(() => a.setLineStyle(((overlay.styles as { line?: { style?: string } } | null)?.line?.style) === 'dashed' ? 'solid' : 'dashed'))} className={btn}>
          <span className="text-[10px] font-bold tracking-tight">╌</span>
        </button>
      </Tooltip>

      {isText && (
        <Tooltip label="Edit text">
          <button type="button" onClick={openSettings} className={btn}>
            <Type className="h-4 w-4" />
          </button>
        </Tooltip>
      )}

      <div className="mx-0.5 h-5 w-px bg-slate-700" />

      {/* Templates */}
      <MenuPopover side="bottom" triggerClassName={btn} contentClassName="w-52" trigger={<LayoutTemplate className="h-4 w-4" />} title="Templates">
        {Object.keys(templates).length === 0 && <div className="px-1 pb-1 text-[11px] text-slate-500">No templates for this tool yet.</div>}
        {Object.entries(templates).map(([tname, def]) => (
          <div key={tname} className="flex items-center rounded hover:bg-slate-800/60">
            <button type="button" onClick={() => run(() => a.applyDefaults(def))} className="flex-1 px-2 py-1 text-left text-xs text-slate-200">
              {tname}
            </button>
            <button
              type="button"
              aria-label={`Delete template ${tname}`}
              onClick={() => useDrawingDefaultsStore.getState().deleteTemplate(overlay.name, tname)}
              className="px-1.5 text-slate-500 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const n = window.prompt('Template name');
            if (n?.trim()) useDrawingDefaultsStore.getState().saveTemplate(overlay.name, n.trim(), a.snapshotDefaults());
          }}
          className="mt-1 w-full rounded bg-slate-800 px-2 py-1 text-left text-xs text-slate-200 hover:bg-slate-700"
        >
          Save as template…
        </button>
      </MenuPopover>

      <Tooltip label="Set as default for this tool">
        <button type="button" onClick={() => useDrawingDefaultsStore.getState().setDefault(overlay.name, a.snapshotDefaults())} className={btn}>
          <Star className="h-4 w-4" />
        </button>
      </Tooltip>

      <Tooltip label="Settings">
        <button type="button" onClick={openSettings} className={btn}>
          <Settings className="h-4 w-4" />
        </button>
      </Tooltip>

      <div className="mx-0.5 h-5 w-px bg-slate-700" />

      <Tooltip label="Clone">
        <button type="button" onClick={() => run(a.clone)} className={btn}>
          <Copy className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip label={overlay.lock ? 'Unlock' : 'Lock'}>
        <button type="button" onClick={() => run(a.toggleLock)} className={btn}>
          {overlay.lock ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </button>
      </Tooltip>
      <Tooltip label={hidden ? 'Show' : 'Hide'}>
        <button type="button" onClick={() => run(a.toggleHidden)} className={btn}>
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </Tooltip>
      <Tooltip label="Delete">
        <button type="button" onClick={() => a.remove()} className="flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-red-950 hover:text-red-400">
          <Trash2 className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
