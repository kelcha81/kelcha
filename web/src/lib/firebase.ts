import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

// Public Firebase web config. These values are NOT secret — they ship in every
// Firebase web app's client bundle by design; access is controlled by Firebase
// Auth + Firestore security rules, not by hiding this config.
const firebaseConfig = {
  apiKey: 'AIzaSyCvi_EO5QszajBRaN0uonEuFZtVd9jOses',
  authDomain: 'co-pilot-516023.firebaseapp.com',
  projectId: 'co-pilot-516023',
  storageBucket: 'co-pilot-516023.firebasestorage.app',
  messagingSenderId: '416980317465',
  appId: '1:416980317465:web:e45fff8cd1af1d2447c188',
};

let _auth: Auth | undefined;

// Lazy init so the SDK only touches the browser (never at SSR module-eval time).
export function firebaseAuth(): Auth {
  if (!_auth) {
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _auth = getAuth(app);
  }
  return _auth;
}

/** Current user's Firebase ID token, or null if signed out. Sent to the engine. */
export async function getIdToken(): Promise<string | null> {
  const user = firebaseAuth().currentUser;
  return user ? user.getIdToken() : null;
}
