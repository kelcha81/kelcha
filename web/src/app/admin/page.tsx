'use client';

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { getIdToken } from '@/lib/firebase';

interface AdminUser {
  uid: string;
  email?: string;
  disabled: boolean;
  admin: boolean;
  modules: Record<string, boolean>;
  lastSignIn?: string | null;
}

async function api(method: string, body?: unknown) {
  const token = await getIdToken();
  const res = await fetch('/api/admin/users', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-slate-300">{children}</div>
  );
}

export default function AdminPage() {
  const { user, claims, loading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api('GET')
      .then((d) => setUsers(d.users))
      .catch((e) => setErr(String(e.message)));
  }, []);

  useEffect(() => {
    if (claims.admin === true) refresh();
  }, [claims.admin, refresh]);

  if (loading) return <Center>Loading…</Center>;
  if (!user)
    return (
      <Center>
        Please&nbsp;
        <Link href="/" className="underline">
          sign in
        </Link>
        .
      </Center>
    );
  if (claims.admin !== true) return <Center>Not authorized.</Center>;

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('POST', { email: email.trim(), password });
      setEmail('');
      setPassword('');
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function toggleModule(u: AdminUser, mod: string) {
    setErr(null);
    try {
      await api('PATCH', { uid: u.uid, modules: { ...u.modules, [mod]: !u.modules[mod] } });
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  async function toggleDisabled(u: AdminUser) {
    setErr(null);
    try {
      await api('PATCH', { uid: u.uid, disabled: !u.disabled });
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f14] p-6 text-slate-200">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Admin · Accounts</h1>
          <Link href="/" className="text-xs text-sky-400 hover:underline">
            ← Back to app
          </Link>
        </div>

        <form onSubmit={createUser} className="mb-6 flex flex-wrap items-end gap-2 rounded border border-slate-800 bg-slate-900/50 p-3">
          <div>
            <label className="block text-xs text-slate-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400">Password</label>
            <input
              type="text"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sky-600 px-3 py-1 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </form>

        {err && <p className="mb-3 text-xs text-rose-400">{err}</p>}

        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2">Email</th>
              <th>ICT Training</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.uid} className="border-t border-slate-800">
                <td className="py-2">
                  {u.email} {u.admin && <span className="ml-1 rounded bg-amber-900/50 px-1 text-[10px] text-amber-300">admin</span>}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggleModule(u, 'ictTraining')}
                    className={`rounded px-2 py-0.5 text-xs ${u.modules.ictTraining ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-300'}`}
                  >
                    {u.modules.ictTraining ? 'On' : 'Off'}
                  </button>
                </td>
                <td className="text-xs text-slate-400">{u.disabled ? 'Disabled' : 'Active'}</td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => toggleDisabled(u)}
                    className="rounded bg-slate-700 px-2 py-0.5 text-xs hover:bg-slate-600"
                  >
                    {u.disabled ? 'Enable' : 'Disable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
