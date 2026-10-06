import type { RequestHandler } from 'express';

import { AppError } from '../lib/app-error.js';
import type { RateLimitPolicy, RateLimitService } from '../services/rate-limit.service.js';

/**
 * Throttles a route per caller address. `req.ip` honours the `trust proxy`
 * setting, so behind a platform proxy it is the real client, not the proxy.
 */
export function rateLimit(service: RateLimitService, policy: RateLimitPolicy): RequestHandler {
  return async (req, res, next) => {
    const { allowed, retryAfterSec } = await service.consume(policy, req.ip ?? 'unknown');
    if (!allowed) {
      res.set('Retry-After', String(retryAfterSec));
      throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
    }
    next();
  };
}
