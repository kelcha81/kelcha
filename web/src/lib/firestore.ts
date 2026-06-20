import { getApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { firebaseAuth } from '@/lib/firebase';

// Client-side Firestore handle. Reads/writes are governed by security rules
// (per-user isolation). Lazy so it only initialises in the browser.
let _db: Firestore | undefined;

export function db(): Firestore {
  firebaseAuth(); // ensure initializeApp() has run
  if (!_db) _db = getFirestore(getApp());
  return _db;
}
