import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

// Public Firebase web config. These values are NOT secret — they ship in every
// Firebase web app's client bundle by design; access is controlled by Firebase
// Auth + Firestore security rules, not by hiding this config.
const firebaseConfig = {
  apiKey: 'AIzaSyCMWRmK_m7m-hLG2V6jrU8-Gyr4rAA7-tA',
  authDomain: 'lc-trading.firebaseapp.com',
  projectId: 'lc-trading',
  storageBucket: 'lc-trading.firebasestorage.app',
  messagingSenderId: '669864201745',
  appId: '1:669864201745:web:bd5309330108d7b3e76bb0'
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
