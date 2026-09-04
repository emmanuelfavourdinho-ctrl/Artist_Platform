import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { config } from '../config/index.js';

function buildFirebaseAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp({
    credential: cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

export const adminAuth: Auth =
  config.nodeEnv === 'test'
    ? ({
        verifyIdToken: async () => {
          throw new Error('Firebase authentication is unavailable in API unit tests');
        },
      } as unknown as Auth)
    : getAuth(buildFirebaseAdminApp());
