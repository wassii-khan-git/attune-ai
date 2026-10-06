import type { ApiError } from '@attune/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

import { AppError } from '../lib/app-error.js';

type ErrorResponse = { status: number; body: ApiError };

function respond(
  status: number,
  code: ApiError['error']['code'],
  message: string,
  details?: ApiError['error']['details'],
): ErrorResponse {
  return {
    status,
    body: { error: { code, message, ...(details === undefined ? {} : { details }) } },
  };
}

/** Errors raised by Express's body parsers, identified by their `type` field. */
function bodyParserErrorType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const { type } = error;
    return typeof type === 'string' ? type : undefined;
  }
  return undefined;
}

/**
 * Decides what the client sees. Anything not recognised becomes a generic 500:
 * an unexpected error's own message never leaves the server.
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return respond(
      error.status,
      error.code,
      error.message,
      error.details === undefined ? undefined : [...error.details],
    );
  }

  if (error instanceof ZodError) {
    // Zod messages describe the expected shape and do not echo the received value.
    return respond(
      400,
      'VALIDATION_ERROR',
      'The request is not valid.',
      error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }

  if (error instanceof MulterError) {
    return error.code === 'LIMIT_FILE_SIZE'
      ? respond(413, 'PAYLOAD_TOO_LARGE', 'The recording is too large.')
      : respond(400, 'BAD_REQUEST', 'The upload could not be read.');
  }

  const parserError = bodyParserErrorType(error);
  if (parserError === 'entity.too.large') {
    return respond(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }
  if (parserError !== undefined) {
    return respond(400, 'BAD_REQUEST', 'The request body could not be read.');
  }

  return respond(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

/** Last middleware in the chain: turns every error into the standard envelope. */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (res.headersSent) {
    // A response is already streaming, so the only option left is to cut it short.
    // Express's own fallback is not used here: it would print the error to the console,
    // past the redacting logger.
    req.log.error({ err: error }, 'error after the response started');
    res.destroy();
    return;
  }

  const { status, body } = toErrorResponse(error);
  if (status >= 500) {
    req.log.error({ err: error }, 'unhandled error');
  }
  res.status(status).json(body);
};

/** Catches every request no route claimed. */
export const notFoundHandler: RequestHandler = () => {
  throw new AppError(404, 'NOT_FOUND', 'The requested resource does not exist.');
};
