import cors from 'cors';
import type { RequestHandler } from 'express';
import helmetModule, { type HelmetOptions } from 'helmet';

const CORS_PREFLIGHT_MAX_AGE_SEC = 600;

/**
 * `helmet`, under a signature written out here.
 *
 * helmet publishes one set of types for ES modules and another for CommonJS.
 * Vercel's builder type-checks every import as if the importing file were
 * CommonJS, picks the CommonJS types, and then reads this default import as a
 * module object instead of the function Node really provides at runtime. The
 * build fails on a call that is correct.
 *
 * Stating the type here gives the same answer under both readings. The options
 * are still checked against helmet's own `HelmetOptions`.
 */
const helmet = helmetModule as unknown as (options?: HelmetOptions) => RequestHandler;

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
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: CORS_PREFLIGHT_MAX_AGE_SEC,
  });
}
