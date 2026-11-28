'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

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
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0b0f14] text-sm text-slate-400">
        Loading Co-Pilot…
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#0b0f14] text-slate-300">
        <p className="text-sm">Sign in to access Co-Pilot Command Center.</p>
        <Link href="/" className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 text-slate-100">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </main>
  );
}
