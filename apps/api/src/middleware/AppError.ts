/**
 * Represents a known, expected error condition (bad input, not found,
 * unauthorized, etc.) as opposed to an unexpected programmer/runtime
 * error (null pointer, DB driver crash, etc).
 *
 * The distinction matters in errorHandler: operational errors are safe
 * to surface to the client as-is; non-operational errors must be logged
 * in full but masked behind a generic message in the response, since
 * their content (stack traces, library internals, DB errors) can leak
 * implementation details.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly code?: string;

  constructor(
    message: string,
    statusCode = 500,
    options?: { code?: string; isOperational?: boolean },
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
    this.code = options?.code;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
