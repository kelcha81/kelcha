'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User
} from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Custom claims from the ID token (e.g. admin, modules). */
  claims: Record<string, unknown>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth(), async (u) => {
      setUser(u);
      setClaims(u ? ((await u.getIdTokenResult()).claims as Record<string, unknown>) : {});
      setLoading(false);
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebaseAuth(), email, password);
  };
  const signOut = async () => {
    await fbSignOut(firebaseAuth());
  };

  return <Ctx.Provider value={{ user, loading, claims, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
