import cors from 'cors';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

const CORS_PREFLIGHT_MAX_AGE_SEC = 600;

/**
 * Security headers for a JSON API. Nothing this server returns should be
 * rendered or framed, so the content security policy denies everything.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // The API is called from the web app's origin, so its responses must be readable cross-origin.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}

/**
 * Only origins on the allowlist get CORS headers; any other origin gets none
 * and the browser blocks the response. Credentials are allowed because the web
 * app authenticates with cookies.
 */
export function corsAllowlist(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return cors({
    // Decided per request: a plain list would still send the credentials header to unknown origins.
    origin: (origin, callback) => {
      callback(null, origin !== undefined && allowed.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: CORS_PREFLIGHT_MAX_AGE_SEC,
  });
}
