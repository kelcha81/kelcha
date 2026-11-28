'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User
} from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';

const DEFAULT_ALLOWED_EMAILS = new Set(['kelvin.chau.uk@gmail.com', 'kelvin@kelcha.com']);

function isAllowedEmail(email: string | null | undefined): boolean {
  const e = (email || '').trim().toLowerCase();
  return Boolean(e) && DEFAULT_ALLOWED_EMAILS.has(e);
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authError: string | null;
  /** Custom claims from the ID token (e.g. admin, modules). */
  claims: Record<string, unknown>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth(), async (u) => {
      if (u && !isAllowedEmail(u.email)) {
        await fbSignOut(firebaseAuth());
        setUser(null);
        setClaims({});
        setAuthError('Access denied: this Google account is not on the Co-Pilot invite list.');
        setLoading(false);
        return;
      }
      setAuthError(null);
      setUser(u);
      // Force-refresh so newly-granted custom claims (admin, modules) are picked
      // up without requiring a full sign-out/in.
      setClaims(u ? ((await u.getIdTokenResult(true)).claims as Record<string, unknown>) : {});
      setLoading(false);
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    await signInWithEmailAndPassword(firebaseAuth(), email, password);
  };
  const signInWithGoogle = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(firebaseAuth(), provider);
    if (!isAllowedEmail(cred.user.email)) {
      await fbSignOut(firebaseAuth());
      throw new Error('Access denied: account not on the Co-Pilot invite list.');
    }
  };
  const signOut = async () => {
    await fbSignOut(firebaseAuth());
  };

  return (
    <Ctx.Provider value={{ user, loading, authError, claims, signIn, signInWithGoogle, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
