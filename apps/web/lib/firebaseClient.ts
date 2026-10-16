'use client';

import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const invalidFirebaseEnv = Object.entries(firebaseEnv)
  .filter(([, value]) => !value?.trim() || /^your-/i.test(value.trim()))
  .map(([name]) => name);

if (process.env.NODE_ENV !== 'test' && invalidFirebaseEnv.length > 0) {
  throw new Error(
    `Firebase is not configured. Set valid values for ${invalidFirebaseEnv.join(', ')} in apps/web/.env.local using your Firebase Web app settings, then restart the Next.js server.`,
  );
}

const firebaseConfig: FirebaseOptions = {
  apiKey: firebaseEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: firebaseEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: firebaseEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: firebaseEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: firebaseEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: firebaseEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
