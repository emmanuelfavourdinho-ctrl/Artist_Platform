// Augments Express's Request type with properties attached by our own
// middleware. Centralized here (rather than declared inline in each
// middleware file) so there's one place to check for what's on `req`.
//
// - id: correlation ID set by the request-logging middleware in app.ts.
// - user: set by requireAuth.ts (and therefore also requireAdmin.ts,
//   which composes on top of it) once a valid session is verified.
//   There is no separate "admin" shape — an admin is just a user whose
//   roles array includes 'ADMIN'.
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: { id: string; email: string; roles: string[] };
    }
  }
}

export {};
