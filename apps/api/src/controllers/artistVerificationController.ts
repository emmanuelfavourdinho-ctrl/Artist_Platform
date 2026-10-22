import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';
import {
  cancelInfoRequest,
  createInfoRequest,
  decideVerification,
  getOwnRequest,
  getOwnVerification,
  getReviewDetail,
  listQueue,
  submitOwnResponse,
} from '../services/artistVerificationService.js';
import type {
  CancelRequestInput,
  CreateInfoRequestInput,
  DecisionInput,
  QueueQuery,
  SubmitResponseInput,
} from '../validation/artistVerification.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function user(req: Request) {
  if (!req.user) throw new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' });
  return req.user;
}

function idParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value || !UUID.test(value)) {
    throw new HttpError(400, `Invalid ${name}`, { code: 'INVALID_ID' });
  }
  return value;
}

const staff = (req: Request) => ({ actorId: user(req).id, requestId: req.id ?? null });

// --- staff -----------------------------------------------------------------

export async function queueHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listQueue(req.query as unknown as QueueQuery);
    res.json({ status: 'success', data: data.applications, pagination: data.pagination });
  } catch (error) {
    next(error);
  }
}

export async function reviewDetailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ status: 'success', data: await getReviewDetail(idParam(req, 'artistId')) });
  } catch (error) {
    next(error);
  }
}

export async function createRequestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createInfoRequest(
      idParam(req, 'artistId'),
      req.body as CreateInfoRequestInput,
      staff(req),
    );
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

export async function cancelRequestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = req.body as CancelRequestInput;
    res.json({
      status: 'success',
      data: await cancelInfoRequest(idParam(req, 'requestId'), reason, staff(req)),
    });
  } catch (error) {
    next(error);
  }
}

export async function decisionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      status: 'success',
      data: await decideVerification(idParam(req, 'artistId'), req.body as DecisionInput, staff(req)),
    });
  } catch (error) {
    next(error);
  }
}

// --- artist (owner-scoped) -------------------------------------------------

export async function ownVerificationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ status: 'success', data: await getOwnVerification(user(req).id) });
  } catch (error) {
    next(error);
  }
}

export async function ownRequestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ status: 'success', data: await getOwnRequest(user(req).id, idParam(req, 'id')) });
  } catch (error) {
    next(error);
  }
}

export async function submitResponseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { responses } = req.body as SubmitResponseInput;
    const result = await submitOwnResponse(user(req).id, idParam(req, 'id'), responses, {
      requestId: req.id ?? null,
    });
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}
