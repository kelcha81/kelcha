'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useUserPluginsStore, type UserPlugin } from '@/store/userPluginsStore';
import { usePluginStore } from '@/store/pluginStore';
import { Modal } from '@/components/ui/dialog';
import { confirm } from '@/components/ui/confirm';

const TEMPLATE = `// ctx: { chart, container, symbol }
//   chart     -> KLineChart instance (createIndicator, createOverlay, ...)
//   container -> the chart's DOM element
//   symbol    -> active symbol id
// Return a cleanup function that removes whatever you added.

const paneId = ctx.chart.createIndicator('RSI', false);
return () => { if (paneId) ctx.chart.removeIndicator(paneId); };`;

export function PluginManager({ onClose }: { onClose: () => void }) {
  const plugins = useUserPluginsStore((s) => s.plugins);
  const upsert = useUserPluginsStore((s) => s.upsert);
  const remove = useUserPluginsStore((s) => s.remove);
  const enabled = usePluginStore((s) => s.enabled);
  const toggle = usePluginStore((s) => s.toggle);

  const list = Object.values(plugins);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState(TEMPLATE);

  const startNew = () => {
    setEditingId(null);
    setName('');
    setCode(TEMPLATE);
  };
  const startEdit = (p: UserPlugin) => {
    setEditingId(p.id);
    setName(p.name);
    setCode(p.code);
  };
  const save = () => {
    if (!name.trim()) return;
    const id = upsert({ id: editingId ?? undefined, name: name.trim(), code });
    setEditingId(id);
  };

  return (
    <Modal onClose={onClose} ariaLabel="Plugin manager" className="h-[80vh] max-h-[80vh] w-[860px]">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Plugin list */}
        <div className="flex w-56 shrink-0 flex-col border-r border-slate-800 p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">My Plugins</span>
            <button
              type="button"
              onClick={startNew}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
            >
              <Plus className="h-3 w-3" /> New
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {list.length === 0 && <div className="px-1 text-xs text-slate-500">No custom plugins yet.</div>}
            {list.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${
                  editingId === p.id ? 'bg-slate-800' : 'hover:bg-slate-800/60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!enabled[p.id]}
                  onChange={() => toggle(p.id)}
                  title="Enable on charts"
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <button type="button" onClick={() => startEdit(p)} className="flex-1 truncate text-left">
                  {p.name}
                </button>
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={async () => {
                    if (await confirm({ title: `Delete plugin "${p.name}"?`, danger: true, confirmLabel: 'Delete' })) {
                      remove(p.id);
                      if (editingId === p.id) startNew();
                    }
                  }}
                  className="text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex flex-1 flex-col p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={name}
              placeholder="Plugin name"
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100"
            />
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className="rounded bg-blue-600 px-4 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {editingId ? 'Save' : 'Create'}
            </button>
            <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <textarea
            value={code}
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-0 flex-1 resize-none rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs leading-relaxed text-slate-100 focus:outline-none"
          />
          <div className="mt-2 text-[11px] text-slate-500">
            Code is the body of <code>attach(ctx)</code> and runs with app privileges (personal
            use). After saving, enable it in the list (or the Indicators menu). Errors are logged
            to the console and won&apos;t crash the app.
          </div>
        </div>
      </div>
    </Modal>
  );
}
