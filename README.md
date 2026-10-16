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

The frontend and API have separate environment files because they are
independent workspaces and run in different security contexts. Review
`apps/web/.env.example` and `apps/api/.env.example`, then copy each template
to its local filename only if that destination does not already exist:

- `apps/web/.env.local` for Next.js.
- `apps/api/.env` for the Express API and Prisma CLI.

Replace the placeholders with values from your own services. Never commit the
local files. The repository ignore rules exclude them while keeping the
`.env.example` templates trackable.

### Required local services and credentials

- **PostgreSQL:** Set `DATABASE_URL` to your development database connection
  string. Prisma reads this value from `apps/api/.env`. Encode special
  characters in the database username or password for use in a URL. The
  schema uses one PostgreSQL URL; no separate direct/migration URL is
  configured.
- **Redis:** The API server connects to Redis during startup, including for
  shared rate limiting. Start a local Redis service and set `REDIS_URL`.
- **Firebase Authentication:** In Firebase Console → Project settings → Your
  apps, copy the Web app configuration into the six
  `NEXT_PUBLIC_FIREBASE_*` entries in `apps/web/.env.local`. These values are
  public browser configuration, not private credentials. Enable Email/Password
  and Google under Authentication → Sign-in method, and authorize local and
  production frontend domains.
- **Firebase Admin:** The API verifies Firebase ID tokens using
  `FIREBASE_SERVICE_ACCOUNT_BASE64`. Create/download a service-account JSON
  from Firebase project settings, encode it locally as a single base64 string,
  and place it only in `apps/api/.env` or the API deployment's secret store.
  Never use a `NEXT_PUBLIC_*` name for this value or commit the JSON/key.
- **Authentication secrets:** Set distinct random values of at least 32
  characters for `JWT_SECRET` and `COOKIE_SECRET`. Generate them locally with
  a cryptographically secure random generator; do not reuse one for both.
- **Stripe:** Local payment development requires a Stripe **test-mode**
  `STRIPE_SECRET_KEY` and the `STRIPE_WEBHOOK_SECRET` for your local test
  webhook listener. Both belong only in the API environment. The current
  checkout redirects to Stripe and does not require a browser publishable key.

### Optional integrations

- **Cloudinary:** Set the API-side cloud name, API key, and API secret only if
  enabling signed uploads. The API secret must remain server-side.
- **EmailJS:** The contact page can use the public service ID, template ID, and
  public key in `apps/web/.env.local` to send best-effort notifications. The
  contact message is stored through the API first. Do not put private email
  credentials in frontend variables.
- **Elasticsearch:** `ELASTICSEARCH_NODE` defaults to
  `http://localhost:9200`; configure it only when running the search service.
- Other rate-limit, timeout, proxy, and body-size variables in the API template
  have code defaults and can generally be left unchanged for local development.

The browser authenticates with Firebase and sends an ID token to
`POST /api/v1/auth/sync`. The API verifies it with Firebase Admin, then finds
or creates the matching PostgreSQL `User` by Firebase UID. PostgreSQL remains
the source of truth for application roles and account state.

### Verification

The automated API tests use mocked Firebase token verification and do not need
real credentials. For a real end-to-end check, run PostgreSQL, configure both
env files, start the API and web apps, then exercise email signup, email
verification, Google sign-in, password reset, buyer routing, artist onboarding,
and protected admin/artist routes. Production deployment also requires the
API `CORS_ORIGIN` to contain the deployed frontend origin.
