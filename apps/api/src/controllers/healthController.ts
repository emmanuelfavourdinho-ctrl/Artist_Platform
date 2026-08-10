import type { Request, Response } from 'express';

export const healthController = {
  check: (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  },
};
