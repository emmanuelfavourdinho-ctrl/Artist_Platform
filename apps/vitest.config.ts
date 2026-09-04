import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Plain Node — this is an Express API test suite, no DOM involved.
    // apps/web's jsdom + testing-library setup.ts is entirely separate
    // and untouched by this file.
    environment: 'node',
    globals: true,
    include: ['**/*.test.{ts,tsx}'],
    // Tests must be self-contained — never depend on the developer's
    // local .env (inconsistent across machines, leaks real config into
    // a supposedly isolated run). These fake values only need to
    // satisfy the Zod schema in config/index.ts (JWT_SECRET/
    // COOKIE_SECRET min length 32, REDIS_URL must parse as a URL) — no
    // test exercises real signing or a real Redis connection with them.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-not-for-production-use-only-12345',
      COOKIE_SECRET: 'test-cookie-secret-not-for-production-use-6789',
      REDIS_URL: 'redis://localhost:6379',
      FIREBASE_PROJECT_ID: 'artist-platform-test',
      FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-test@artist-platform-test.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY:
        '-----BEGIN PRIVATE KEY-----\\nTEST-ONLY-NOT-A-REAL-KEY\\n-----END PRIVATE KEY-----\\n',
    },
  },
});
