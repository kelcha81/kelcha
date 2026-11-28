'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Brain,
  CandlestickChart,
  FlaskConical,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { copilotApi, type TwinHealth } from '@/lib/copilotApi';
import { useCopilotStore } from '@/store/copilotStore';

const NAV_ITEMS = [
  { href: '/', label: 'Chart Desk', Icon: CandlestickChart },
  { href: '/desk', label: 'Live Desk', Icon: Radio },
  { href: '/knowledge', label: 'Knowledge (L0–L5)', Icon: Brain },
  { href: '/lab', label: 'Quant Lab', Icon: FlaskConical },
  { href: '/chat', label: 'Co-Pilot Chat', Icon: MessageSquare },
];

export function CopilotNavShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const [health, setHealth] = useState<TwinHealth | null>(null);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-sm text-slate-400">
        Loading Co-Pilot…
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0b0f14] text-slate-300">
        <p className="text-sm">Sign in to access Co-Pilot Command Center.</p>
        <Link href="/" className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-[#0b0f14]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-sm">Co-Pilot</span>
            </Link>

            <nav className="flex flex-wrap items-center gap-1">
              {NAV_ITEMS.map(({ href, label, Icon }) => {
                const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/40'
                        : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="hidden items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-300 md:flex">
              <span className={`h-2 w-2 rounded-full ${health?.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span>
                {health?.ok
                  ? `Brain ${health.playbook_version} · ${health.cases_loaded} cases`
                  : 'Connecting Twin…'}
              </span>
            </div>

            {pathname !== '/chat' && (
              <button
                type="button"
                onClick={() => openDrawer()}
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Ask Co-Pilot
              </button>
            )}

            <Link
              href="/admin"
              className="hidden items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:bg-slate-800 sm:flex"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
              Admin
            </Link>

            <button
              type="button"
              onClick={() => signOut()}
              className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}
