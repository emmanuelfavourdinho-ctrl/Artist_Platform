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
    // a supposedly isolated run). These fake values only satisfy the
    // configuration schema; tests do not connect to Firebase or Redis.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-not-for-production-use-only-12345',
      COOKIE_SECRET: 'test-cookie-secret-not-for-production-use-6789',
      REDIS_URL: 'redis://localhost:6379',
      FIREBASE_PROJECT_ID: 'artist-platform-test',
      FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-test@artist-platform-test.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'test-only-placeholder',
      // Required by the API config schema since the Stripe/Firebase
      // service-account work landed. Fake, test-only values: nothing in
      // the test suite connects to Stripe or Firebase (both are mocked).
      FIREBASE_SERVICE_ACCOUNT_BASE64: 'dGVzdC1vbmx5LXBsYWNlaG9sZGVy',
      STRIPE_SECRET_KEY: 'sk_test_placeholder_not_a_real_key',
      STRIPE_WEBHOOK_SECRET: 'whsec_placeholder_not_a_real_secret',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    },
  },
});
