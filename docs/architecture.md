# Architecture Overview

This repository is organized as an npm workspace monorepo with separate frontend and backend applications.

## Structure

- `apps/web` — Next.js frontend using App Router, React, TypeScript, Tailwind CSS, SEO metadata, and server-rendered pages.
- `apps/api` — Express REST API using TypeScript, centralized route handling, validation readiness with Zod, and a versioned API path.
- `packages/config` — shared configuration constants that can be imported by both frontend and backend apps.
- `packages/types` — shared TypeScript types and API contracts.

## Frontend goals

- SEO-first approach using Next.js metadata and sitemap support.
- Minimal client-side JavaScript where possible.
- Image-ready architecture with Next.js Image support and CDN-ready patterns.
- Tailwind CSS for utility-driven responsive UI.

## Backend goals

- Clear separation of routes, controllers, middleware, and configuration.
- API versioning using `/api/v1`.
- Centralized error handling and consistent JSON responses.
- Secure defaults with Helmet and CORS configuration.

## Data layer roadmap

- PostgreSQL as the source of truth.
- Prisma ORM for type-safe database access.
- Redis as an acceleration layer for caching, rate limiting, and temporary data.
- Object storage / CDN for artwork image delivery.
