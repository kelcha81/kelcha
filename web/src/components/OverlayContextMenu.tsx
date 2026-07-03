'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Settings, Copy, Lock, Unlock, Trash2, Star } from 'lucide-react';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useDrawingsStore } from '@/store/drawingsStore';
import { useDrawingDefaultsStore } from '@/store/drawingDefaultsStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { TEXT_NOTE } from '@/lib/overlays/textNote';
import { CALLOUT } from '@/lib/overlays/callout';
import { FIB_TOOL, DEFAULT_FIB_RATIOS, fibRatios } from '@/lib/overlays/fibTool';
import { FIB_EXTENSION, DEFAULT_EXT_RATIOS } from '@/lib/overlays/fibExtension';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#a855f7', '#ffffff', '#64748b'];
const WIDTHS = [1, 2, 3];

function Item({
  icon: Icon,
  label,
  onClick,
  danger
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800 ${danger ? 'text-red-400' : 'text-slate-200'}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/** Right-click menu for any overlay (trade box, drawing, annotation). */
export function OverlayContextMenu() {
  const { open, x, y, chart, overlay, paneKey, close } = useOverlayMenuStore();
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, close);
  const [showSettings, setShowSettings] = useState(false);
  const [pts, setPts] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [levelsText, setLevelsText] = useState('');

  useEffect(() => {
    if (!open) setShowSettings(false);
  }, [open]);

  useEffect(() => {
    if (overlay) {
      setPts(overlay.points.map((p) => p.value ?? 0));
      setText((overlay.extendData as { text?: string } | undefined)?.text ?? '');
      const defaults = overlay.name === FIB_EXTENSION ? DEFAULT_EXT_RATIOS : DEFAULT_FIB_RATIOS;
      const levels = (overlay.extendData as { levels?: number[] } | undefined)?.levels;
      setLevelsText((levels && levels.length ? levels : overlay.name === FIB_TOOL ? fibRatios(overlay.extendData) : defaults).join(', '));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.id]);

  // Delete / Backspace removes the currently-selected overlay (unless typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const sel = useOverlayMenuStore.getState().selected;
      if (!sel) return;
      sel.chart.removeOverlay(sel.id);
      if (sel.paneKey) useDrawingsStore.getState().remove(sel.paneKey, sel.id);
      useOverlayMenuStore.getState().setSelected(null);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open || !chart || !overlay) return null;

  // Persist the overlay's live state (points/styles/text) after any edit.
  const persistLive = () => {
    if (!paneKey) return;
    const live = chart.getOverlayById(overlay.id);
    if (!live) return;
    useDrawingsStore.getState().upsert(paneKey, {
      id: live.id,
      name: live.name,
      points: live.points,
      extendData: live.extendData as Record<string, unknown> | undefined,
      styles: live.styles as Record<string, unknown> | undefined
    });
  };

  const apply = (styles: Record<string, unknown>) => {
    chart.overrideOverlay({ id: overlay.id, styles });
    persistLive();
  };
  const setColor = (color: string) =>
    apply({ line: { color }, polygon: { color }, circle: { color }, arc: { color }, text: { color }, rect: { borderColor: color } });
  const setWidth = (size: number) => apply({ line: { size } });
  const setStyle = (style: string) => apply({ line: { style } });

  // Reposition a drawing by editing a point's price directly.
  const applyPoint = (i: number, v: number) => {
    const next = pts.slice();
    next[i] = v;
    setPts(next);
    chart.overrideOverlay({ id: overlay.id, points: overlay.points.map((p, j) => ({ ...p, value: next[j] ?? p.value })) });
    persistLive();
  };

  // Edit the text of a text annotation / callout.
  const applyText = (v: string) => {
    setText(v);
    chart.overrideOverlay({ id: overlay.id, extendData: { ...((overlay.extendData ?? {}) as Record<string, unknown>), text: v } });
    persistLive();
  };

  // Edit fib ratios (comma-separated); applied only when the input parses.
  const applyLevels = (v: string) => {
    setLevelsText(v);
    const levels = v
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (levels.length === 0 || levels.some((n) => !Number.isFinite(n))) return;
    chart.overrideOverlay({ id: overlay.id, extendData: { ...((overlay.extendData ?? {}) as Record<string, unknown>), levels } });
    persistLive();
  };

  // Save this overlay's styles (+ non-content extendData like fib levels) as
  // the default every NEW drawing of this tool starts from.
  const setAsDefault = () => {
    const live = chart.getOverlayById(overlay.id) ?? overlay;
    const ext = { ...((live.extendData ?? {}) as Record<string, unknown>) };
    delete ext.text; // content is never a default
    useDrawingDefaultsStore.getState().setDefault(live.name, {
      styles: (live.styles as Record<string, unknown> | null) ?? undefined,
      extendData: Object.keys(ext).length ? ext : undefined
    });
    close();
  };

  const clone = () => {
    chart.createOverlay({ name: overlay.name, points: overlay.points });
    close();
  };
  const toggleLock = () => {
    chart.overrideOverlay({ id: overlay.id, lock: !overlay.lock });
    close();
  };
  const remove = () => {
    chart.removeOverlay({ id: overlay.id });
    if (paneKey) useDrawingsStore.getState().remove(paneKey, overlay.id);
    close();
  };

  return (
    <div
      ref={ref}
      style={{
        left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 188),
        top: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 240)
      }}
      className="fixed z-50 w-44 overflow-hidden rounded-md border border-slate-700 bg-slate-900 py-1 text-xs shadow-xl"
    >
      <Item icon={Settings} label="Settings" onClick={() => setShowSettings((v) => !v)} />
      {showSettings && (
        <div className="space-y-2 border-y border-slate-800 px-2 py-2">
          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ background: c }}
                className="h-4 w-4 rounded-full border border-slate-600"
              />
            ))}
          </div>
          <div className="flex gap-1">
            {WIDTHS.map((w) => (
              <button key={w} type="button" onClick={() => setWidth(w)} className="flex-1 rounded bg-slate-800 py-0.5 hover:bg-slate-700">
                {w}px
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {['solid', 'dashed'].map((s) => (
              <button key={s} type="button" onClick={() => setStyle(s)} className="flex-1 rounded bg-slate-800 py-0.5 capitalize hover:bg-slate-700">
                {s}
              </button>
            ))}
          </div>
          {(overlay.name === TEXT_NOTE || overlay.name === CALLOUT) && (
            <input
              type="text"
              value={text}
              placeholder="Text…"
              onChange={(e) => applyText(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-slate-100"
            />
          )}
          {(overlay.name === FIB_TOOL || overlay.name === FIB_EXTENSION) && (
            <label className="block text-[11px] text-slate-400">
              Levels
              <input
                type="text"
                value={levelsText}
                placeholder="0, 0.382, 0.618, 1"
                onChange={(e) => applyLevels(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-slate-100"
              />
            </label>
          )}
          {paneKey && pts.length > 0 && overlay.name !== TEXT_NOTE && (
            <div className="space-y-1 border-t border-slate-800 pt-2">
              {pts.map((v, i) => (
                <label key={i} className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  {pts.length > 1 ? `Price ${i + 1}` : 'Price'}
                  <input
                    type="number"
                    step="any"
                    value={v}
                    onChange={(e) => applyPoint(i, Number(e.target.value))}
                    className="w-24 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-right text-slate-100"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <Item icon={Star} label="Set as default for tool" onClick={setAsDefault} />
      <Item icon={Copy} label="Clone" onClick={clone} />
      <Item icon={overlay.lock ? Unlock : Lock} label={overlay.lock ? 'Unlock' : 'Lock'} onClick={toggleLock} />
      <Item icon={Trash2} label="Remove" onClick={remove} danger />
    </div>
  );
}
