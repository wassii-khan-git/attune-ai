import type { Request, RequestHandler } from 'express';

import { AppError } from '../lib/app-error.js';
import type { RateLimitPolicy, RateLimitService } from '../services/rate-limit.service.js';

/** Who a request is counted against. */
export type RateLimitKey = (req: Request) => string;

/** The client's network address, as worked out by the `clientAddress` middleware. Used before sign-in. */
export const byAddress: RateLimitKey = (req) => req.clientAddress;

/** The signed-in user, so a limit follows the account and cannot be dodged by changing address. */
export const byUser: RateLimitKey = (req) => req.auth?.userId ?? byAddress(req);

export function rateLimit(
  service: RateLimitService,
  policy: RateLimitPolicy,
  keyOf: RateLimitKey = byAddress,
): RequestHandler {
  return async (req, res, next) => {
    const { allowed, retryAfterSec } = await service.consume(policy, keyOf(req));
    if (!allowed) {
      res.set('Retry-After', String(retryAfterSec));
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.', {
        reason: `rate_limited:${policy.name}`,
      });
    }
    next();
  };
}
