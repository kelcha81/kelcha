'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';

export function Login() {
  const { signIn, signInWithGoogle, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError('Invalid email or password.');
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  const shownError = error || authError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-slate-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-xl"
      >
        <h1 className="mb-1 text-lg font-semibold">Co-Pilot Sign in</h1>
        <p className="mb-5 text-xs text-slate-400">Invite-only access. Sign in with an approved Google account or credentials.</p>

        <button
          type="button"
          onClick={onGoogle}
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded border border-slate-700 bg-slate-800 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-2 text-[11px] text-slate-500">
          <div className="h-px flex-1 bg-slate-800" />
          <span>or</span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        <label className="mb-1 block text-xs text-slate-400">Email</label>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />

        <label className="mb-1 block text-xs text-slate-400">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />

        {shownError && <p className="mb-3 text-xs text-rose-400">{shownError}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-sky-600 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
