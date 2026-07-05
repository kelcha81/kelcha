'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useSettingsStore } from '@/store/settingsStore';
import { usePluginStore } from '@/store/pluginStore';
import { useIctStore } from '@/store/ictStore';
import { loadSettings, saveSettings } from '@/lib/userData';
import { runSync } from '@/store/syncStore';

// Syncs the user's settings with Firestore: loads on sign-in, saves (debounced)
// on change. Covers chart theme + display timezone + AI model, and — so they
// follow the login — indicator toggles/params (pluginStore) and the ICT
// Killzones config (ictStore).
export function SettingsSync() {
  const { user } = useAuth();
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    if (!user) return;
    let active = true;
    loadSettings(user.uid)
      .then((s) => {
        if (!active || !s) return;
        useSettingsStore.setState((prev) => ({
          theme: s.theme ?? prev.theme,
          preset: s.preset ?? prev.preset,
          customThemes: s.customThemes ?? prev.customThemes,
          aiModel: s.aiModel ?? prev.aiModel,
          timezone: s.timezone ?? prev.timezone
        }));
        if (s.plugins) {
          usePluginStore.setState((prev) => ({
            enabled: { ...prev.enabled, ...s.plugins!.enabled },
            params: { ...prev.params, ...s.plugins!.params }
          }));
        }
        if (s.ict) useIctStore.setState(s.ict);
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
    const schedule = () => {
      if (!loaded.current) return;
      clearTimeout(t);
      t = setTimeout(() => {
        // Surfaced + retried via runSync; re-reads state so retries stay fresh.
        runSync('settings', () => {
          const cur = useSettingsStore.getState();
          const plugins = usePluginStore.getState();
          const ict = useIctStore.getState();
          return saveSettings(user.uid, {
            theme: cur.theme,
            preset: cur.preset,
            customThemes: cur.customThemes,
            aiModel: cur.aiModel,
            timezone: cur.timezone,
            plugins: { enabled: plugins.enabled, params: plugins.params },
            ict: {
              timezone: ict.timezone,
              maxSessions: ict.maxSessions,
              showBoxes: ict.showBoxes,
              showText: ict.showText,
              showPivots: ict.showPivots,
              showLabels: ict.showLabels,
              killzones: ict.killzones
            }
          });
        });
      }, 800);
    };
    const unsubs = [
      useSettingsStore.subscribe(schedule),
      usePluginStore.subscribe(schedule),
      useIctStore.subscribe(schedule)
    ];
    return () => {
      clearTimeout(t);
      unsubs.forEach((u) => u());
    };
  }, [user]);

  return null;
}
