import { getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Server-only Firebase Admin SDK. On Cloud Run it authenticates via Application
// Default Credentials (the runtime service account, which has firebaseauth.admin
// + datastore.user). Used by the admin API to manage users + custom claims.
let _app: App | undefined;

function app(): App {
  if (!_app) {
    _app =
      getApps()[0] ??
      initializeApp({ credential: applicationDefault(), projectId: 'lc-trading' });
  }
  return _app;
}

export function adminAuth(): Auth {
  return getAuth(app());
}

export function adminDb(): Firestore {
  return getFirestore(app());
}
