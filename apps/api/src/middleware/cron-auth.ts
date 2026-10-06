import { createHash, timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

import { AppError } from '../lib/app-error.js';

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Guards endpoints that only the scheduler may call. Vercel Cron sends the
 * project's `CRON_SECRET` as a bearer token.
 *
 * Both sides are hashed before the comparison so that it takes the same time
 * whatever was sent, including a value of the wrong length.
 */
export function requireCronSecret(secret: string): RequestHandler {
  const expected = sha256(`Bearer ${secret}`);

  return (req, _res, next) => {
    if (!timingSafeEqual(sha256(req.get('authorization') ?? ''), expected)) {
      // The same answer as for a route that does not exist: outsiders learn nothing.
      throw new AppError(404, 'NOT_FOUND', 'The requested resource does not exist.');
    }
    next();
  };
}
