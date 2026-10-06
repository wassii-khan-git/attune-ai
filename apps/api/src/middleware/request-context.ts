import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

import type { Logger } from '../lib/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express exposes this namespace for augmentation
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging needs an interface
    interface Request {
      /** Correlates every log line of this request; echoed in the `X-Request-Id` header. */
      id: string;
      /** A logger bound to this request's id. Use it instead of the root logger. */
      log: Logger;
    }
  }
}

/** A caller-supplied id is reused only if it is short and plain, so it cannot be used to forge log lines. */
const ACCEPTED_INCOMING_ID = /^[\w-]{8,64}$/;
const MAX_LOGGED_PATH_LENGTH = 200;

/**
 * Gives each request an id and a bound logger, and writes one line when the
 * response ends. That line holds the method, path, status and duration only:
 * query strings are left out because search terms can be sensitive, and
 * headers and bodies are never logged.
 */
export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id =
      incoming !== undefined && ACCEPTED_INCOMING_ID.test(incoming) ? incoming : randomUUID();
    req.log = logger.child({ requestId: req.id });
    res.set('X-Request-Id', req.id);

    const startedAt = performance.now();
    // Read now: while a mounted router handles the request, Express shortens
    // `req.path` to the part after the mount point.
    const path = req.path.slice(0, MAX_LOGGED_PATH_LENGTH);
    res.on('finish', () => {
      const summary = {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      };
      if (res.statusCode >= 500) {
        req.log.error(summary, 'request failed');
      } else {
        req.log.info(summary, 'request completed');
      }
    });

    next();
  };
}
