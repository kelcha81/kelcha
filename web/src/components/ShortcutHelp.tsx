'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { registerHotkey, listHotkeys, comboLabel } from '@/lib/hotkeys';

/** `?` opens a dialog listing every registered hotkey, grouped. */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => registerHotkey('shift+?', 'Show keyboard shortcuts', 'General', () => setOpen(true)), []);

  if (!open) return null;
  const groups = listHotkeys();
  return (
    <Modal onClose={() => setOpen(false)} ariaLabel="Keyboard shortcuts" className="w-[420px]">
      <div className="flex items-center justify-between border-b border-slate-800 p-3">
        <span className="text-sm font-semibold">Keyboard shortcuts</span>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {Object.entries(groups).map(([group, keys]) => (
          <div key={group}>
            <div className="mb-1 text-[10px] uppercase text-slate-500">{group}</div>
            <div className="space-y-1">
              {keys.map((k) => (
                <div key={k.combo} className="flex items-center justify-between text-sm text-slate-300">
                  <span>{k.description}</span>
                  <Kbd>{comboLabel(k.combo)}</Kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
