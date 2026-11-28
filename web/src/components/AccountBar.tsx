'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Brain, FlaskConical, MessageSquare, Radio, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Settings } from '@/components/Settings';
import { useCopilotStore } from '@/store/copilotStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

// Small floating account & Command Center navigation control above the chart desk.
export function AccountBar() {
  const { user, claims, signOut } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const activeTab = useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  if (!user) return null;
  return (
    <>
      <div className="fixed right-2 top-2 z-[60] flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900/90 px-2 py-1 text-xs text-slate-300 shadow-lg backdrop-blur">
        <Link href="/desk" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-800 hover:text-white" title="Live Desk & Signals">
          <Radio className="h-3 w-3 text-emerald-400" />
          <span className="hidden sm:inline">Desk</span>
        </Link>
        <Link href="/knowledge" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-800 hover:text-white" title="Knowledge Library & L0-L5 Levels">
          <Brain className="h-3 w-3 text-indigo-400" />
          <span className="hidden sm:inline">Knowledge</span>
        </Link>
        <Link href="/lab" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-300 hover:bg-slate-800 hover:text-white" title="Quant Lab & 18-Pair Health">
          <FlaskConical className="h-3 w-3 text-sky-400" />
          <span className="hidden sm:inline">Lab</span>
        </Link>
        <button
          type="button"
          onClick={() =>
            openDrawer({
              context: activeTab
                ? {
                    kind: 'active_chart',
                    label: `${activeTab.symbol.toUpperCase()} (${activeTab.label})`,
                    symbol: activeTab.symbol.toUpperCase(),
                  }
                : null,
            })
          }
          className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 font-medium text-white hover:bg-indigo-500"
        >
          <MessageSquare className="h-3 w-3" />
          <span>Co-Pilot</span>
        </button>
        <div className="mx-0.5 h-3.5 w-px bg-slate-700" />
        <span className="hidden max-w-[140px] truncate text-slate-400 lg:inline" title={user.email ?? ''}>
          {user.email}
        </span>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
          className="rounded bg-slate-700 p-1 hover:bg-slate-600"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
        </button>
        {claims.admin === true && (
          <Link href="/admin" className="rounded bg-slate-700 px-2 py-0.5 hover:bg-slate-600">
            Admin
          </Link>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded bg-slate-700 px-2 py-0.5 hover:bg-slate-600"
        >
          Sign out
        </button>
      </div>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </>
  );
}
