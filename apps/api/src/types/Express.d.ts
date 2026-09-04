declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: { id: string; email: string; firstName?: string; roles: string[] };
    }
  }
}

export {};
