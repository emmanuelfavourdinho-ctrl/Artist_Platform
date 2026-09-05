import { initializeApp, cert, getApps, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { config } from '../config/index.js';

function buildFirebaseAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  // Decoding a base64 blob back into the original service-account JSON
  // sidesteps every Windows/.env quoting-and-newline problem that raw
  // PEM private keys run into — base64 text has no quotes, no
  // backslashes, no line breaks for anything to mangle in transit.
  const serviceAccountJson = Buffer.from(config.firebase.serviceAccountBase64, 'base64').toString(
    'utf8',
  );
  const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export const adminAuth: Pick<Auth, 'verifyIdToken'> =
  config.nodeEnv === 'test'
    ? {
        verifyIdToken: async (..._args) => {
          throw new Error('Firebase authentication is unavailable in API unit tests');
        },
      }
    : getAuth(buildFirebaseAdminApp());
