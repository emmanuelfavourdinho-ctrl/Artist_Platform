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

See `.env.example` for expected environment variable names.
