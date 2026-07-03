import { create } from 'zustand';
import { toast } from 'sonner';

// Cloud-save health for the whole app. Sync writers run their saves through
// runSync() so failures surface (toast + status chip) and retry with backoff
// instead of being silently swallowed (previously `.catch(() => {})` — a
// data-loss risk the user never saw).

type SyncStatus = 'idle' | 'saving' | 'error';

interface SyncState {
  status: SyncStatus;
  /** Kinds currently failing (e.g. 'workspace', 'settings', 'backtests'). */
  failing: Record<string, boolean>;
  set: (patch: Partial<Pick<SyncState, 'status' | 'failing'>>) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  failing: {},
  set: (patch) => set(patch)
}));

const RETRY_MS = [2000, 5000, 15000, 30000]; // then keep retrying at 30s
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const attempts = new Map<string, number>();
const toasted = new Set<string>();

/**
 * Run a cloud save for `kind`. On failure: mark the kind failing, toast once
 * per outage, and retry with capped backoff. `fn` must re-read current state
 * when it runs (the existing sync closures already do), so a retry always
 * writes the latest data.
 */
export function runSync(kind: string, fn: () => Promise<unknown>): void {
  const s = useSyncStore.getState();
  clearTimeout(timers.get(kind));
  s.set({ status: 'saving' });
  fn()
    .then(() => {
      attempts.delete(kind);
      toasted.delete(kind);
      const failing = { ...useSyncStore.getState().failing };
      delete failing[kind];
      useSyncStore.getState().set({ failing, status: Object.keys(failing).length ? 'error' : 'idle' });
    })
    .catch(() => {
      const n = (attempts.get(kind) ?? 0) + 1;
      attempts.set(kind, n);
      useSyncStore.getState().set({ failing: { ...useSyncStore.getState().failing, [kind]: true }, status: 'error' });
      if (!toasted.has(kind)) {
        toasted.add(kind);
        toast.error(`Cloud save failed (${kind}) — retrying in the background`, { id: `sync-${kind}` });
      }
      const delay = RETRY_MS[Math.min(n - 1, RETRY_MS.length - 1)];
      timers.set(kind, setTimeout(() => runSync(kind, fn), delay));
    });
}
