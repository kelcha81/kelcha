'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Login } from '@/components/Login';

/** Gates the app behind authentication. No public sign-up — login only. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-slate-400">
        Loading…
      </div>
    );
  }
  if (!user) return <Login />;
  return <>{children}</>;
}
