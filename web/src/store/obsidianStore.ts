import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Where backtest ASR notes are written. Mirrors the obsidian-ai-agents plugin's
// own settings (Trade notes folder / Backtest folder / Templates folder) so a
// note the backtest app drops into the vault is auto-parsed by the plugin.
export interface ObsidianConfig {
  vaultPath: string; // absolute path to the Obsidian vault root
  backtestFolder: string; // vault-relative folder for Backtest ASR notes
  liveFolder: string; // vault-relative folder for Live/Daily ASR notes (forward tests)
  forecastFolder: string; // vault-relative folder for Forecast (plan) notes
  templatesFolder: string; // vault-relative Templates folder (for the user's templates)
}

interface ObsidianState extends ObsidianConfig {
  set: (patch: Partial<ObsidianConfig>) => void;
}

export const useObsidianStore = create<ObsidianState>()(
  persist(
    (set) => ({
      vaultPath: '',
      backtestFolder: 'Trades/Backtesting', // matches the plugin's default backtest folder
      liveFolder: 'Trades/ASR', // matches the plugin's live ASR folder
      forecastFolder: 'Trades/Forecast', // matches the plugin's Forecast folder
      templatesFolder: 'Templates',
      set: (patch) => set(patch)
    }),
    { name: 'forex-obsidian' }
  )
);
