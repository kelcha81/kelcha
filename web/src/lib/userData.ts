import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firestore';
import type { ChartTheme } from '@/store/settingsStore';
import type { IctConfig } from '@/store/ictStore';

// Per-user app settings, stored at users/{uid}/private/settings. Owner-only by
// security rules — this is the concrete per-account data that follows a login.
export interface UserSettings {
  theme?: ChartTheme;
  preset?: string;
  customThemes?: Record<string, ChartTheme>;
  aiModel?: string;
  timezone?: string;
  /** Indicator toggles + calc params (from pluginStore). */
  plugins?: { enabled: Record<string, boolean>; params: Record<string, number[]> };
  /** ICT Killzones config (from ictStore). */
  ict?: IctConfig;
}

const settingsRef = (uid: string) => doc(db(), 'users', uid, 'private', 'settings');

export async function loadSettings(uid: string): Promise<UserSettings | null> {
  const snap = await getDoc(settingsRef(uid));
  return snap.exists() ? (snap.data() as UserSettings) : null;
}

export async function saveSettings(uid: string, data: UserSettings): Promise<void> {
  await setDoc(settingsRef(uid), data, { merge: true });
}
