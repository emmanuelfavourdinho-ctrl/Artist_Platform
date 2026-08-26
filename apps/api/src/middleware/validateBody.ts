import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

import { HttpError } from '../lib/httpError.js';

/*
  Explainer: this is a small "factory" — a function that builds a
  middleware function, customized for whatever schema you hand it. This
  pattern means we write the "check the request body against a schema,
  and reject it clearly if it fails" logic exactly ONCE, and reuse it for
  every endpoint that needs validation (review submission, admin login,
  moderation actions) rather than repeating similar validation code in
  every single controller.

  Usage: router.post('/reviews', validateBody(submitReviewSchema), submitReview)
*/
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    let result: ReturnType<ZodSchema<T>['safeParse']>;
    try {
      result = schema.safeParse(req.body);
    } catch (err) {
      // safeParse is only guaranteed not to throw for parsing failures
      // themselves — a custom .refine()/.transform() callback that
      // throws instead of returning propagates out of safeParse. That's
      // a bug in the schema's validation logic, not bad client input,
      // so it belongs in the 500 path via the central error handler,
      // not a 400 here.
      next(err);
      return;
    }

    if (!result.success) {
      // .issues[0] is the FIRST validation problem Zod found — used as
      // the single, friendly top-level message. Prefixing with the field
      // path (when there is one) disambiguates which field it refers to,
      // since "Invalid email" alone is unhelpful on a multi-field form.
      const firstIssue = result.error.issues[0];
      const message = firstIssue
        ? firstIssue.path.length
          ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
          : firstIssue.message
        : 'Invalid request body';

      // The FULL issue list also goes out as `details`, so a client
      // building a form can highlight every invalid field at once
      // instead of round-tripping one error at a time.
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      next(new HttpError(400, message, { code: 'VALIDATION_ERROR', details }));
      return;
    }

    // Replace the raw, untrusted body with the parsed, validated,
    // correctly-typed version — everything downstream (the controller)
    // can now trust req.body completely.
    req.body = result.data;
    next();
  };
}
