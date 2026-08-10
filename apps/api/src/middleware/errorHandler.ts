import type { NextFunction, Request, Response } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const status = (err as { status?: number })?.status ?? 500;
  const message = (err as { message?: string })?.message ?? 'Internal server error';

  res.status(status).json({
    status: 'error',
    message,
  });
}
