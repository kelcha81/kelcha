'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useSettingsStore } from '@/store/settingsStore';
import { loadSettings, saveSettings } from '@/lib/userData';
import { runSync } from '@/store/syncStore';

// Syncs the user's settings with Firestore: loads on sign-in, saves (debounced)
// on change. This is the per-account data that proves isolation via rules.
export function SettingsSync() {
  const { user } = useAuth();
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    if (!user) return;
    let active = true;
    loadSettings(user.uid)
      .then((s) => {
        if (active && s) {
          useSettingsStore.setState((prev) => ({
            theme: s.theme ?? prev.theme,
            preset: s.preset ?? prev.preset,
            customThemes: s.customThemes ?? prev.customThemes,
            aiModel: s.aiModel ?? prev.aiModel
          }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) loaded.current = true;
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useSettingsStore.subscribe(() => {
      if (!loaded.current) return;
      clearTimeout(t);
      t = setTimeout(() => {
        // Surfaced + retried via runSync; re-reads state so retries stay fresh.
        runSync('settings', () => {
          const cur = useSettingsStore.getState();
          return saveSettings(user.uid, {
            theme: cur.theme,
            preset: cur.preset,
            customThemes: cur.customThemes,
            aiModel: cur.aiModel
          });
        });
      }, 800);
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [user]);

  return null;
}
