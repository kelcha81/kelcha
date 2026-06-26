import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firestore';
import { parseFrontmatter } from '@/lib/obsidian/asr';

// Canonical, per-user copy of journal/forecast notes, written alongside the local
// Obsidian vault file. Owner-only by Firestore rules (users/{uid}/**). The doc id
// is the note filename (stable across round-trip edits); structured fields are
// parsed back out of the rendered markdown's frontmatter.

export interface CaptureRef {
  tf: string;
  path: string;
  stage?: 'pre' | 'post';
}

interface EntryInput {
  filename: string;
  folder: string;
  markdown: string;
  captures: CaptureRef[];
  kind: string; // 'Backtest' | 'Live' (journal) or 'Daily' | 'Weekly' (forecast)
}

const idFor = (filename: string) => filename.replace(/\.md$/i, '');

async function saveEntry(uid: string, collection: string, input: EntryInput): Promise<void> {
  await setDoc(
    doc(db(), 'users', uid, collection, idFor(input.filename)),
    {
      filename: input.filename,
      folder: input.folder,
      kind: input.kind,
      frontmatter: parseFrontmatter(input.markdown),
      markdown: input.markdown,
      captures: input.captures,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export const saveJournalEntry = (uid: string, input: EntryInput) => saveEntry(uid, 'journalEntries', input);
export const saveForecastEntry = (uid: string, input: EntryInput) => saveEntry(uid, 'forecasts', input);
