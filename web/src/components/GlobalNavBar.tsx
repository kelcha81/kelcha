'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Brain,
  CandlestickChart,
  FlaskConical,
  MessageSquare,
  Radio,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { copilotApi, type TwinHealth } from '@/lib/copilotApi';
import { Settings } from '@/components/Settings';
import { useCopilotStore } from '@/store/copilotStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const NAV_ITEMS = [
  { href: '/', label: 'Chart Desk', Icon: CandlestickChart },
  { href: '/desk', label: 'Live Desk', Icon: Radio },
  { href: '/knowledge', label: 'Knowledge (L0–L5)', Icon: Brain },
  { href: '/lab', label: 'Quant Lab', Icon: FlaskConical },
  { href: '/chat', label: 'Co-Pilot Chat', Icon: MessageSquare },
];

export function GlobalNavBar() {
  const pathname = usePathname();
  const { user, claims, signOut } = useAuth();
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const activeTab = useWorkspaceStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const workspaceView = useWorkspaceStore((s) => s.view);
  const [health, setHealth] = useState<TwinHealth | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    copilotApi
      .health()
      .then((h) => {
        if (active) setHealth(h);
      })
      .catch(() => {
        if (active) setHealth(null);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  const isAdminRoute = pathname.startsWith('/admin');

  function handleAskCopilot() {
    if (pathname === '/' && workspaceView === 'session' && activeTab) {
      openDrawer({
        context: {
          kind: 'active_chart',
          label: `${activeTab.symbol.toUpperCase()} (${activeTab.label})`,
          symbol: activeTab.symbol.toUpperCase(),
        },
      });
      return;
    }
    openDrawer();
  }

  return (
    <>
      <header className="sticky top-0 z-50 h-12 shrink-0 border-b border-slate-800/90 bg-[#0b0f14]/95 backdrop-blur">
        <div className="flex h-full w-full items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-slate-100"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-sm">Co-Pilot</span>
            </Link>

            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {NAV_ITEMS.map(({ href, label, Icon }) => {
                const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/40'
                        : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs">
            <div className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 xl:flex">
              <span className={`h-2 w-2 rounded-full ${health?.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span>
                {health?.ok
                  ? `Brain ${health.playbook_version} · ${health.cases_loaded} cases`
                  : 'Connecting Twin…'}
              </span>
            </div>

            {health?.ig_shadow && (
              <Link
                href="/desk"
                title={`IG UK Spread Bet Shadow: ${health.ig_shadow.status} (${health.ig_shadow.verified_epics}/${health.ig_shadow.total_epics} EPICs, ${health.ig_shadow.closed_m1_total} M1 bars)`}
                className={`hidden items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] 2xl:flex ${
                  health.ig_shadow.status === 'ONLINE'
                    ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                    : health.ig_shadow.status === 'STALE'
                      ? 'border-amber-500/40 bg-amber-950/30 text-amber-300'
                      : 'border-rose-500/40 bg-rose-950/30 text-rose-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    health.ig_shadow.status === 'ONLINE'
                      ? 'bg-emerald-400'
                      : health.ig_shadow.status === 'STALE'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                  }`}
                />
                <span>
                  IG {health.ig_shadow.status} · {health.ig_shadow.verified_epics}/{health.ig_shadow.total_epics}
                </span>
              </Link>
            )}

            {pathname !== '/chat' && (
              <button
                type="button"
                onClick={handleAskCopilot}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span>Ask Co-Pilot</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              title="Settings"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>

            {claims.admin === true && (
              <Link
                href="/admin"
                className={`hidden shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-1 sm:flex ${
                  isAdminRoute
                    ? 'border-sky-500/40 bg-sky-600/20 text-sky-300'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>Admin</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => signOut()}
              className="shrink-0 whitespace-nowrap rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </>
  );
}
