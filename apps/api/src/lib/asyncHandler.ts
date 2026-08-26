import type { NextFunction, Request, Response } from 'express';

/*
  Explainer: Express was originally built before `async/await` existed
  in JavaScript, so it has a gap — if an `async` function throws (or a
  Promise it's awaiting rejects), Express does NOT automatically catch
  that and hand it to our errorHandler middleware. Without this wrapper,
  an error thrown inside, say, submitReview would just vanish into an
  "unhandled promise rejection" instead of turning into a proper error
  response for the visitor.

  This function solves it once, in one place: wrap any async controller
  with asyncHandler(...), and any error it throws gets correctly forwarded
  to next(err) — which is exactly what routes to our errorHandler.
*/
type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
