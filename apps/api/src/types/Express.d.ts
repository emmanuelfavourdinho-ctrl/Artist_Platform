declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        firstName?: string;
        roles: string[];
        /** Current account status, resolved by requireAuth on every request. */
        status?: string;
      };
    }
  }
}

export {};
