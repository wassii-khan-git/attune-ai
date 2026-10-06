import type { z } from 'zod';

import { AppError } from './app-error.js';

/**
 * Validates something a client sent: a body, path parameters or a query.
 * A failure here is the client's mistake, so it becomes a 400 that names the
 * fields at fault. Zod's messages describe the rule that failed and do not
 * repeat the value received.
 *
 * Use this for request input only. Parsing our own stored data with a schema
 * should throw a plain error, which is reported as a 500, because then the
 * fault is ours.
 */
export function parseRequest<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The request is not valid.', {
      details: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
