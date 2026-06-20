'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

// Small floating account control: who's signed in, an Admin link (admins only),
// and sign out. Sits above the dashboard.
export function AccountBar() {
  const { user, claims, signOut } = useAuth();
  if (!user) return null;
  return (
    <div className="fixed right-2 top-2 z-[60] flex items-center gap-2 rounded border border-slate-700 bg-slate-900/85 px-2 py-1 text-xs text-slate-300 backdrop-blur">
      <span className="max-w-[180px] truncate" title={user.email ?? ''}>
        {user.email}
      </span>
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
  );
}
