'use client';

// Tiny app-wide hotkey registry. Components register combos on mount and get
// an unregister function back; one document-level listener dispatches. Keys
// are ignored while typing in inputs/textareas/selects/contentEditable.
//
// Combo format: lowercase key with optional modifiers, e.g. 'space', 'delete',
// 'arrowleft', 'shift+arrowright', 'alt+t', 'shift+/'. `key` matching uses
// KeyboardEvent.key (lowercased, ' ' → 'space').

export interface Hotkey {
  combo: string;
  description: string;
  group: string;
  handler: (e: KeyboardEvent) => void;
}

const registry = new Map<string, Hotkey>();
let listening = false;

function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
  parts.push(key);
  return parts.join('+');
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping(e.target)) return;
  const hk = registry.get(comboOf(e));
  if (!hk) return;
  e.preventDefault();
  hk.handler(e);
}

/** Register a hotkey; returns an unregister function (use in useEffect). */
export function registerHotkey(combo: string, description: string, group: string, handler: (e: KeyboardEvent) => void): () => void {
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeyDown);
    listening = true;
  }
  registry.set(combo, { combo, description, group, handler });
  return () => {
    if (registry.get(combo)?.handler === handler) registry.delete(combo);
  };
}

/** Current bindings, grouped — for the shortcut help dialog. */
export function listHotkeys(): Record<string, Hotkey[]> {
  const groups: Record<string, Hotkey[]> = {};
  for (const hk of registry.values()) (groups[hk.group] ??= []).push(hk);
  return groups;
}

/** Human label for a combo ('mod+arrowleft' → 'Ctrl + ←'). */
export function comboLabel(combo: string): string {
  return combo
    .split('+')
    .map((p) => ({ mod: 'Ctrl', alt: 'Alt', shift: 'Shift', space: 'Space', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', delete: 'Del', escape: 'Esc' })[p] ?? p.toUpperCase())
    .join(' + ');
}
