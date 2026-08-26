interface HttpErrorOptions {
  /** Machine-readable code (e.g. 'NOT_FOUND', 'VALIDATION_ERROR') so API
   *  consumers can branch on error type without string-matching `message`. */
  code?: string;
  /** True (default) for expected, client-facing conditions whose message
   *  is safe to return as-is. Set false for a thrown HttpError that still
   *  shouldn't leak its message to the client (rare — usually you'd just
   *  throw a plain Error for that and let errorHandler mask it). */
  isOperational?: boolean;
  /** Structured extra context — e.g. a list of per-field validation
   *  issues — for clients that want more than a single message string. */
  details?: unknown;
}

/*
        Explainer: a normal JavaScript Error doesn't have a concept of
        "HTTP status code" — this small class adds one. Throwing
        `new HttpError(404, 'Review not found')` anywhere in a controller lets
        the existing errorHandler middleware (in middleware/errorHandler.ts)
        automatically turn it into the correct HTTP response, without every
        controller needing to know how to format a response itself.
        */
export class HttpError extends Error {
  readonly status: number;
  readonly isOperational: boolean;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, options: HttpErrorOptions = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.isOperational = options.isOperational ?? true;
    this.code = options.code;
    this.details = options.details;
    // Excludes this constructor frame from the stack trace so it points
    // straight at the throw site — Node-only API, guarded for other runtimes.
    Error.captureStackTrace?.(this, this.constructor);
  }
}
