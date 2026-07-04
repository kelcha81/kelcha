import { doc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firestore';
import type { SavedOverlay } from '@/store/drawingsStore';

// Per-user, per-tab drawings so they follow the login across devices. One doc
// per session tab: users/{uid}/drawings/{tabId} = { panes: { [paneId]: [] } }.
// Owner-only by the existing users/{uid}/** Firestore rules (no rules change).
//
// The drawingsStore keys overlays by `${tabId}:${paneId}`; these helpers convert
// between that flat map and the per-tab doc shape.

interface TabDrawings {
  panes: Record<string, SavedOverlay[]>;
}

const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const tabRef = (uid: string, tabId: string) => doc(db(), 'users', uid, 'drawings', tabId);

/** Split a store key `${tabId}:${paneId}` (neither part contains ':'). */
export function splitKey(key: string): [tabId: string, paneId: string] {
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}

/** Group the flat drawings map into per-tab pane maps (skips empty panes). */
export function groupByTab(drawings: Record<string, SavedOverlay[]>): Map<string, Record<string, SavedOverlay[]>> {
  const byTab = new Map<string, Record<string, SavedOverlay[]>>();
  for (const [key, list] of Object.entries(drawings)) {
    if (!list.length) continue;
    const [tabId, paneId] = splitKey(key);
    const panes = byTab.get(tabId) ?? {};
    panes[paneId] = list;
    byTab.set(tabId, panes);
  }
  return byTab;
}

/** Load every tab's drawings into the store's flat `${tabId}:${paneId}` shape. */
export async function loadAllDrawings(uid: string): Promise<Record<string, SavedOverlay[]>> {
  const snap = await getDocs(collection(db(), 'users', uid, 'drawings'));
  const out: Record<string, SavedOverlay[]> = {};
  snap.forEach((d) => {
    const panes = (d.data() as TabDrawings).panes ?? {};
    for (const [paneId, overlays] of Object.entries(panes)) out[`${d.id}:${paneId}`] = overlays;
  });
  return out;
}

export async function saveTabDrawings(uid: string, tabId: string, panes: Record<string, SavedOverlay[]>): Promise<void> {
  await setDoc(tabRef(uid, tabId), clean({ panes } satisfies TabDrawings));
}

export async function removeTabDrawings(uid: string, tabId: string): Promise<void> {
  await deleteDoc(tabRef(uid, tabId));
}
