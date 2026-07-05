import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firestore';

// Ephemeral in-progress journal/forecast DRAFTS, per user. Captures survive
// closing the window / reloading / switching devices, so you can build one note
// across timeframes without losing screenshots, and reopen it to add more.
//
// These are working data, not archives — the vault/Notion note is the permanent
// home. Drafts auto-purge 48h after the last edit via a Firestore TTL policy on
// `expireAt` (set once on the collection) PLUS a client-side sweep on load.
//
// Captures are stored compressed (JPEG) as SEPARATE docs under a `captures`
// subcollection to stay under Firestore's ~1MB per-doc limit. Owner-only via the
// existing users/{uid}/** rules.

const TTL_MS = 48 * 60 * 60 * 1000;

export type DraftKind = 'journal' | 'forecast';

export interface DraftCapture {
  id: string;
  tf: string;
  stage?: 'pre' | 'post';
  name: string;
  note?: string;
  dataUrl: string; // compressed JPEG
}

export interface DraftMeta {
  fields?: Record<string, unknown>;
}

const draftId = (kind: DraftKind, id: string) => `${kind}:${id}`;
const draftDoc = (uid: string, kind: DraftKind, id: string) =>
  doc(db(), 'users', uid, 'journalDrafts', draftId(kind, id));
const capCol = (uid: string, kind: DraftKind, id: string) =>
  collection(db(), 'users', uid, 'journalDrafts', draftId(kind, id), 'captures');

const expiry = () => Timestamp.fromMillis(Date.now() + TTL_MS);

/** Upsert the draft's scalar fields (fast; images go via saveDraftCapture). */
export async function saveDraftMeta(uid: string, kind: DraftKind, id: string, meta: DraftMeta): Promise<void> {
  await setDoc(
    draftDoc(uid, kind, id),
    { kind, noteId: id, ...meta, expireAt: expiry(), updatedAt: Timestamp.now() },
    { merge: true }
  );
}

/** Persist a single (already-compressed) capture. Also refreshes the draft TTL. */
export async function saveDraftCapture(uid: string, kind: DraftKind, id: string, cap: DraftCapture): Promise<void> {
  await setDoc(doc(capCol(uid, kind, id), cap.id), { ...cap, expireAt: expiry() });
  await setDoc(draftDoc(uid, kind, id), { kind, noteId: id, expireAt: expiry() }, { merge: true });
}

export async function deleteDraftCapture(uid: string, kind: DraftKind, id: string, capId: string): Promise<void> {
  await deleteDoc(doc(capCol(uid, kind, id), capId));
}

/** Load a draft's fields + captures, or null if none / already expired. */
export async function loadDraft(
  uid: string,
  kind: DraftKind,
  id: string
): Promise<{ meta: DraftMeta; captures: DraftCapture[] } | null> {
  const snap = await getDoc(draftDoc(uid, kind, id));
  if (!snap.exists()) return null;
  const d = snap.data();
  const exp = d.expireAt as Timestamp | undefined;
  if (exp && exp.toMillis() < Date.now()) return null; // stale (TTL not yet swept)
  const caps = await getDocs(capCol(uid, kind, id));
  return {
    meta: { fields: (d.fields as Record<string, unknown>) ?? {} },
    captures: caps.docs.map((c) => c.data() as DraftCapture)
  };
}

/** Remove a draft and all its captures (call after a successful save/export). */
export async function deleteDraft(uid: string, kind: DraftKind, id: string): Promise<void> {
  const caps = await getDocs(capCol(uid, kind, id));
  await Promise.all(caps.docs.map((c) => deleteDoc(c.ref)));
  await deleteDoc(draftDoc(uid, kind, id));
}

/** Client-side sweep of drafts past their TTL (belt-and-braces vs the policy). */
export async function purgeExpiredDrafts(uid: string): Promise<void> {
  const col = collection(db(), 'users', uid, 'journalDrafts');
  const stale = await getDocs(query(col, where('expireAt', '<', Timestamp.now())));
  await Promise.all(
    stale.docs.map(async (d) => {
      const caps = await getDocs(collection(d.ref, 'captures'));
      await Promise.all(caps.docs.map((c) => deleteDoc(c.ref)));
      await deleteDoc(d.ref);
    })
  );
}
