'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useSettingsStore } from '@/store/settingsStore';
import { loadSettings, saveSettings } from '@/lib/userData';

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
    const unsub = useSettingsStore.subscribe((s) => {
      if (!loaded.current) return;
      clearTimeout(t);
      t = setTimeout(() => {
        saveSettings(user.uid, {
          theme: s.theme,
          preset: s.preset,
          customThemes: s.customThemes,
          aiModel: s.aiModel
        }).catch(() => {});
      }, 800);
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [user]);

  return null;
}
