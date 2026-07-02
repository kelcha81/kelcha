'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Settings } from '@/components/Settings';

// Small floating account control: who's signed in, app settings, an Admin link
// (admins only), and sign out. Sits above the dashboard.
export function AccountBar() {
  const { user, claims, signOut } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  if (!user) return null;
  return (
    <>
      <div className="fixed right-2 top-2 z-[60] flex items-center gap-2 rounded border border-slate-700 bg-slate-900/85 px-2 py-1 text-xs text-slate-300 backdrop-blur">
        <span className="max-w-[180px] truncate" title={user.email ?? ''}>
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
