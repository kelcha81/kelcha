import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Config for the ICT Killzones & Pivots indicator (port of the original app's
// [TFO]-style plugin). Killzones keep their OWN timezone, independent of the
// global display timezone — sessions are defined in a fixed market zone.

export interface Killzone {
  id: string;
  label: string;
  enabled: boolean;
  session: string; // 'HHMM-HHMM' in the configured timezone (start>end = overnight)
  color: string;
}

export interface IctConfig {
  timezone: string;
  maxSessions: number;
  showBoxes: boolean;
  showText: boolean;
  showPivots: boolean;
  showLabels: boolean;
  killzones: Killzone[];
}

interface IctState extends IctConfig {
  setConfig: (patch: Partial<IctConfig>) => void;
  setKillzone: (id: string, patch: Partial<Killzone>) => void;
}

const DEFAULT_KZ: Killzone[] = [
  { id: 'asia', label: 'Asia', enabled: true, session: '2000-0000', color: '#3b82f6' },
  { id: 'london', label: 'London', enabled: true, session: '0200-0500', color: '#ef4444' },
  { id: 'nyam', label: 'NY AM', enabled: true, session: '0930-1100', color: '#089981' },
  { id: 'nylunch', label: 'NY Lunch', enabled: true, session: '1200-1300', color: '#eab308' },
  { id: 'nypm', label: 'NY PM', enabled: true, session: '1330-1600', color: '#a855f7' }
];

export const useIctStore = create<IctState>()(
  persist(
    (set) => ({
      timezone: 'America/New_York',
      maxSessions: 3,
      showBoxes: true,
      showText: true,
      showPivots: true,
      showLabels: true,
      killzones: DEFAULT_KZ,
      setConfig: (patch) => set(patch),
      setKillzone: (id, patch) =>
        set((s) => ({ killzones: s.killzones.map((k) => (k.id === id ? { ...k, ...patch } : k)) }))
    }),
    { name: 'kelcha-ict' }
  )
);
