import type { Request, RequestHandler } from 'express';

import { AppError } from '../lib/app-error.js';
import type { SessionCookies } from '../lib/session-cookies.js';
import type { AccessTokenClaims, TokenService } from '../services/token.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express exposes this namespace for augmentation
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging needs an interface
    interface Request {
      /** Set by `authenticate`. Read it through `requireAuth`. */
      auth?: AccessTokenClaims;
    }
  }
}

const BEARER_PREFIX = 'Bearer ';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type AuthenticateOptions = {
  tokens: TokenService;
  cookies: SessionCookies;
  allowedOrigins: readonly string[];
};

/**
 * Accepts an access token from the `Authorization` header (native clients) or
 * from the session cookie (browsers), and rejects everything else with a 401.
 *
 * Cookies are sent by the browser automatically, so a cookie-authenticated
 * request that changes state must also come from an allowlisted origin. This
 * backs up `SameSite=Lax`. A bearer token is attached deliberately by the
 * client and needs no such check.
 */
export function authenticate({
  tokens,
  cookies,
  allowedOrigins,
}: AuthenticateOptions): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return async (req, _res, next) => {
    const header = req.get('authorization');
    if (header?.startsWith(BEARER_PREFIX) === true) {
      req.auth = await tokens.verifyAccessToken(header.slice(BEARER_PREFIX.length));
      next();
      return;
    }

    const { accessToken } = cookies.read(req);
    if (accessToken === undefined) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }

    const origin = req.get('origin');
    if (!SAFE_METHODS.has(req.method) && origin !== undefined && !allowed.has(origin)) {
      throw new AppError(403, 'FORBIDDEN', 'This request is not allowed from this origin.', {
        reason: 'forbidden_origin',
      });
    }

    req.auth = await tokens.verifyAccessToken(accessToken);
    next();
  };
}

/** For handlers behind `authenticate`: returns the caller, or fails if the route was wired without it. */
export function requireAuth(req: Request): AccessTokenClaims {
  if (req.auth === undefined) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  return req.auth;
}
