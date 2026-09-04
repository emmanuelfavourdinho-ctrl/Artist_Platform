# Artist Marketplace

A production-ready foundation for a modern artist art-selling marketplace. This repository uses an npm workspace structure with separate frontend and backend applications.

## Architecture

- `apps/web` — Next.js frontend using the App Router, React, TypeScript, Tailwind CSS, and SEO-first design.
- `apps/api` — Express REST API with TypeScript, validation foundation, centralized error handling, and versioned routes.
- `packages/config` — shared configuration for ESLint, Prettier, and TypeScript.
- `packages/types` — shared TypeScript types and API contracts.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the frontend locally:
   ```bash
   npm run dev:web
   ```
3. Run the backend locally:
   ```bash
   npm run dev:api
   ```

## Recommended commands

- `npm run lint` — lint both frontend and backend
- `npm run typecheck` — run TypeScript checks across both apps
- `npm run test` — run smoke tests for both apps

## Environment

Copy `apps/api/.env.example` to `apps/api/.env` and
`apps/web/.env.example` to `apps/web/.env.local`. Replace every placeholder
with local or deployment-specific values. Never commit either real env file.

### Firebase setup

In Firebase Console:

1. Enable **Email/Password** and **Google** under Authentication > Sign-in method.
2. Add the local and production frontend domains under Authentication > Settings > Authorized domains.
3. Register a Web App and copy its `NEXT_PUBLIC_FIREBASE_*` values into the web environment.
4. Configure the password-reset email action URL to return to `/reset-password` on the deployed frontend.
5. Keep the Firebase Admin service-account values (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`) on the API deployment only.

The browser authenticates with Firebase and sends an ID token to
`POST /api/v1/auth/sync`. The API verifies that token, then finds or creates
the matching PostgreSQL `User` by Firebase UID. PostgreSQL remains the source
of truth for application roles and account state.

### Verification

The automated API tests use mocked Firebase token verification and do not need
real credentials. For a real end-to-end check, run PostgreSQL, configure both
env files, start the API and web apps, then exercise email signup, email
verification, Google sign-in, password reset, buyer routing, artist onboarding,
and protected admin/artist routes. Production deployment also requires the
API `CORS_ORIGIN` to contain the deployed frontend origin.
