import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Chart colour theme, wired into KLineChart styles + the chart background. */
export interface ChartTheme {
  up: string;
  down: string;
  /** Candle border colours; absent = follow the body colour (optional so
   *  themes saved before this field existed keep working unchanged). */
  upBorder?: string;
  downBorder?: string;
  background: string;
  grid: string;
  text: string;
  axis: string;
}

export const PRESETS: Record<string, ChartTheme> = {
  Dark: { up: '#16a34a', down: '#dc2626', background: '#0b0f14', grid: '#1b232c', text: '#9aa7b4', axis: '#2a323c' },
  Light: { up: '#16a34a', down: '#dc2626', background: '#ffffff', grid: '#eceff3', text: '#4b5563', axis: '#cbd5e1' },
  Midnight: { up: '#22d3ee', down: '#f43f5e', background: '#0a0f1f', grid: '#16203a', text: '#8aa0c0', axis: '#22304d' }
};

export const DEFAULT_THEME: ChartTheme = PRESETS.Dark;

/** Default Claude model for AI strategy authoring. */
export const DEFAULT_AI_MODEL = 'claude-opus-4-8';

interface SettingsState {
  theme: ChartTheme;
  /** Active theme name; 'Custom' = edited but not yet saved. */
  preset: string;
  /** User-saved themes (persisted). */
  customThemes: Record<string, ChartTheme>;
  /** Selected Claude model id for AI strategy authoring. */
  aiModel: string;
  /** Display timezone (IANA name, or 'UTC') for the chart x-axis + head clock. */
  timezone: string;
  setTheme: (patch: Partial<ChartTheme>) => void;
  applyPreset: (name: string) => void;
  saveTheme: (name: string) => void;
  deleteTheme: (name: string) => void;
  resetTheme: () => void;
  setAiModel: (model: string) => void;
  setTimezone: (tz: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: { ...DEFAULT_THEME },
      preset: 'Dark',
      customThemes: {},
      aiModel: DEFAULT_AI_MODEL,
      timezone: 'UTC',

      // Any colour edit marks the theme 'Custom' (unsaved) -> a Save affordance appears.
      setTheme: (patch) => set((s) => ({ theme: { ...s.theme, ...patch }, preset: 'Custom' })),

      applyPreset: (name) =>
        set((s) => ({ theme: { ...(PRESETS[name] ?? s.customThemes[name] ?? DEFAULT_THEME) }, preset: name })),

      // Save the current colours as a named theme and make it active.
      saveTheme: (name) =>
        set((s) => ({ customThemes: { ...s.customThemes, [name]: { ...s.theme } }, preset: name })),

      deleteTheme: (name) =>
        set((s) => {
          const customThemes = { ...s.customThemes };
          delete customThemes[name];
          return { customThemes, preset: s.preset === name ? 'Custom' : s.preset };
        }),

      resetTheme: () => set({ theme: { ...DEFAULT_THEME }, preset: 'Dark' }),

      setAiModel: (model) => set({ aiModel: model }),

      setTimezone: (timezone) => set({ timezone })
    }),
    {
      name: 'forex-settings',
      version: 4,
      migrate: (persisted) => {
        const s = persisted as Partial<SettingsState>;
        return {
          theme: { ...DEFAULT_THEME, ...(s?.theme ?? {}) },
          preset: s?.preset ?? 'Custom',
          customThemes: s?.customThemes ?? {},
          aiModel: s?.aiModel ?? DEFAULT_AI_MODEL,
          timezone: s?.timezone ?? 'UTC'
        } as SettingsState;
      }
    }
  )
);
