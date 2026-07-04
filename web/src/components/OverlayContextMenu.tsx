'use client';

import { useEffect, useRef, type ComponentType } from 'react';
import { Settings, Copy, Lock, Unlock, Trash2, Star, Target, Eye, EyeOff, ArrowUp, ArrowDown, LayoutTemplate } from 'lucide-react';
import { useOverlayMenuStore } from '@/store/overlayMenuStore';
import { useDrawingDefaultsStore } from '@/store/drawingDefaultsStore';
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { drawingActions } from '@/lib/drawingActions';
import { POSITION_DRAWING } from '@/lib/overlays/positionDrawing';

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

/**
 * Right-click menu for any overlay. Quick style edits live in the floating
 * toolbar (on selection) and the Settings dialog; this menu is the action list
 * (settings / templates / order / clone / lock / hide / z-order / remove).
 * All mutations go through the shared drawingActions module.
 */
export function OverlayContextMenu() {
  const { open, x, y, chart, overlay, paneKey, close } = useOverlayMenuStore();
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, close);

  // Delete / Backspace removes the currently-selected overlay (unless typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const sel = useOverlayMenuStore.getState().selected;
      if (!sel) return;
      drawingActions({ chart: sel.chart, overlayId: sel.id, paneKey: sel.paneKey }).remove();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open || !chart || !overlay) return null;

  const hidden = ((overlay.extendData ?? {}) as { hidden?: boolean }).hidden === true;
  const a = drawingActions({ chart, overlayId: overlay.id, paneKey });
  const act = (fn: () => void) => {
    fn();
    close();
  };

  return (
    <div
      ref={ref}
      style={{
        left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 200),
        top: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 320)
      }}
      className="fixed z-[var(--z-menu)] w-48 overflow-hidden rounded-md border border-slate-700 bg-slate-900 py-1 text-xs shadow-xl"
    >
      <Item
        icon={Settings}
        label="Settings…"
        onClick={() => act(() => useDrawingSettingsStore.getState().openSettings({ chart, overlayId: overlay.id, paneKey, name: overlay.name }))}
      />
      {overlay.name === POSITION_DRAWING && <Item icon={Target} label="Apply to order ticket" onClick={() => act(a.applyToTicket)} />}
      <Item icon={Star} label="Set as default for tool" onClick={() => act(() => useDrawingDefaultsStore.getState().setDefault(overlay.name, a.snapshotDefaults()))} />
      <Item
        icon={LayoutTemplate}
        label="Save as template…"
        onClick={() =>
          act(() => {
            const n = window.prompt('Template name');
            if (n?.trim()) useDrawingDefaultsStore.getState().saveTemplate(overlay.name, n.trim(), a.snapshotDefaults());
          })
        }
      />
      <div className="my-1 h-px bg-slate-800" />
      <Item icon={Copy} label="Clone" onClick={() => act(a.clone)} />
      <Item icon={overlay.lock ? Unlock : Lock} label={overlay.lock ? 'Unlock' : 'Lock'} onClick={() => act(a.toggleLock)} />
      <Item icon={hidden ? Eye : EyeOff} label={hidden ? 'Show' : 'Hide'} onClick={() => act(a.toggleHidden)} />
      <Item icon={ArrowUp} label="Bring to front" onClick={() => act(a.bringToFront)} />
      <Item icon={ArrowDown} label="Send to back" onClick={() => act(a.sendToBack)} />
      <div className="my-1 h-px bg-slate-800" />
      <Item icon={Trash2} label="Remove" onClick={() => act(a.remove)} danger />
    </div>
  );
}
