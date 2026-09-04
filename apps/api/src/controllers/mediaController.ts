import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { config } from '../config/index.js';

export function getCommissionUploadSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    if (!userId || !cloudName || !apiKey || !apiSecret) {
      res.status(503).json({ status: 'error', message: 'Image uploads are not configured' });
      return;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `users/${userId}/commissions`;
    const signature = createHash('sha1')
      .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
      .digest('hex');
    res.json({ status: 'success', data: { timestamp, signature, apiKey, cloudName, folder } });
  } catch (error) {
    next(error);
  }
}
