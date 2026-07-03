'use client';

import { useState } from 'react';
import { X, Plus, Home, Pencil, Copy, XCircle } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { NewSessionDialog } from '@/components/NewSessionDialog';
import { confirm } from '@/components/ui/confirm';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';

/**
 * Session tabs: switch / rename (double-click) / close, and "+" opens the New
 * Session dialog (instrument + date range). Each tab is an independent session.
 */
export function TabBar() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const selectTab = useWorkspaceStore((s) => s.selectTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const renameTab = useWorkspaceStore((s) => s.renameTab);
  const goHome = useWorkspaceStore((s) => s.goHome);
  const duplicateTab = useWorkspaceStore((s) => s.duplicateTab);
  const closeOthers = useWorkspaceStore((s) => s.closeOthers);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const commitRename = (id: string) => {
    if (draft.trim()) renameTab(id, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950 px-2 py-1">
      <button
        type="button"
        title="Home (sessions dashboard)"
        aria-label="Home (sessions dashboard)"
        onClick={goHome}
        className="flex h-6 w-6 items-center justify-center rounded text-slate-300 transition hover:bg-slate-800"
      >
        <Home className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-slate-700" />

      {tabs.map((t) => {
        const active = t.id === activeTabId;
        return (
          <ContextMenu key={t.id}>
            <ContextMenuTrigger asChild>
          <div
            className={`group flex items-center gap-1 rounded px-2 py-1 text-xs ${
              active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900'
            }`}
          >
            {editingId === t.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRename(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(t.id);
                  else if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-24 rounded border border-slate-600 bg-slate-900 px-1 text-xs text-white focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => selectTab(t.id)}
                onDoubleClick={() => {
                  setEditingId(t.id);
                  setDraft(t.label);
                }}
                title="Double-click to rename"
              >
                {t.label}
              </button>
            )}
            {tabs.length > 1 && (
              <button
                type="button"
                aria-label={`Close ${t.label}`}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete session "${t.label}"?`,
                      body: 'Its trades and drawings stay in your account until the session is deleted.',
                      danger: true,
                      confirmLabel: 'Delete'
                    })
                  )
                    closeTab(t.id);
                }}
                className="ml-0.5 rounded text-slate-500 transition hover:bg-slate-700 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                icon={Pencil}
                label="Rename"
                onSelect={() => {
                  setEditingId(t.id);
                  setDraft(t.label);
                }}
              />
              <ContextMenuItem icon={Copy} label="Duplicate session" onSelect={() => duplicateTab(t.id)} />
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={X}
                label="Close"
                danger
                onSelect={async () => {
                  if (
                    await confirm({
                      title: `Delete session "${t.label}"?`,
                      body: 'Its trades and drawings stay in your account until the session is deleted.',
                      danger: true,
                      confirmLabel: 'Delete'
                    })
                  )
                    closeTab(t.id);
                }}
              />
              {tabs.length > 1 && (
                <ContextMenuItem
                  icon={XCircle}
                  label="Close others"
                  danger
                  onSelect={async () => {
                    if (
                      await confirm({
                        title: `Close all sessions except "${t.label}"?`,
                        body: `Deletes ${tabs.length - 1} other session(s), their trades and stats.`,
                        danger: true,
                        confirmLabel: 'Close others'
                      })
                    )
                      closeOthers(t.id);
                  }}
                />
              )}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}

      <button
        type="button"
        title="New session"
        onClick={() => setNewOpen(true)}
        className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
      </button>

      {newOpen && <NewSessionDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}
