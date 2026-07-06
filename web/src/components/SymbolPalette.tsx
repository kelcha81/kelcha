'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AVAILABLE_SYMBOLS } from '@/lib/symbols';
import { usePackagedSymbols } from '@/hooks/usePackagedSymbols';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { registerHotkey } from '@/lib/hotkeys';
import { Modal } from '@/components/ui/dialog';
import { NewSessionDialog } from '@/components/NewSessionDialog';

// Ctrl/Cmd+K symbol palette: jump to an open session or start a new one on any
// instrument. Rows are sessions first (switch instantly), then registry
// instruments (opens New Session prefilled).

type Row =
  | { kind: 'session'; id: string; title: string; sub: string; enabled: true }
  | { kind: 'symbol'; id: string; title: string; sub: string; enabled: boolean };

export function SymbolPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [newSymbol, setNewSymbol] = useState<string | null>(null);

  const tabs = useWorkspaceStore((s) => s.tabs);
  const openSession = useWorkspaceStore((s) => s.openSession);
  const { statuses, refresh } = usePackagedSymbols();

  useEffect(
    () =>
      registerHotkey('mod+k', 'Symbol search', 'Global', () => {
        setQuery('');
        setSel(0);
        refresh();
        setOpen(true);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const sessions: Row[] = tabs
      .filter((t) => !q || t.label.toLowerCase().includes(q) || t.symbol.includes(q))
      .map((t) => ({
        kind: 'session',
        id: t.id,
        title: t.label,
        sub: `open session · ${t.symbol.toUpperCase()}`,
        enabled: true
      }));
    const symbols: Row[] = AVAILABLE_SYMBOLS.filter(
      (s) => !q || s.symbol.includes(q) || s.label.toLowerCase().includes(q)
    ).map((s) => {
      const ready = !!(statuses[s.symbol]?.packaged || statuses[s.symbol]?.seeded);
      return {
        kind: 'symbol',
        id: s.symbol,
        title: s.label,
        sub: ready ? `new session · ${s.assetClass}` : 'not packaged — see Data panel',
        enabled: ready
      };
    });
    return [...sessions, ...symbols];
  }, [query, tabs, statuses]);

  const pick = (row: Row | undefined) => {
    if (!row || !row.enabled) return;
    setOpen(false);
    if (row.kind === 'session') openSession(row.id);
    else setNewSymbol(row.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(rows[sel]);
    }
  };

  return (
    <>
      {open && (
        <Modal onClose={() => setOpen(false)} ariaLabel="Symbol search" className="w-[440px]">
          <div className="flex items-center gap-2 border-b border-slate-800 p-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              autoFocus
              value={query}
              placeholder="Search symbols and sessions…"
              onChange={(e) => {
                setQuery(e.target.value);
                setSel(0);
              }}
              onKeyDown={onKeyDown}
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
            />
            <kbd className="rounded border border-slate-700 px-1 text-[10px] text-slate-500">esc</kbd>
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {rows.length === 0 && <div className="p-3 text-xs text-slate-500">No matches.</div>}
            {rows.map((row, i) => (
              <button
                key={`${row.kind}:${row.id}`}
                type="button"
                disabled={!row.enabled}
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(row)}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                  i === sel ? 'bg-slate-800' : ''
                } ${row.enabled ? 'text-slate-100' : 'cursor-default text-slate-600'}`}
              >
                <span>{row.title}</span>
                <span className="text-[10px] uppercase text-slate-500">{row.sub}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {newSymbol && <NewSessionDialog initialSymbol={newSymbol} onClose={() => setNewSymbol(null)} />}
    </>
  );
}
