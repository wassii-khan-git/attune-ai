import express, { Router, type Express } from 'express';

import { createAuthController } from './controllers/auth.controller.js';
import { createHealthController } from './controllers/health.controller.js';
import type { Logger } from './lib/logger.js';
import { createPasswordHasher, DEFAULT_BCRYPT_COST } from './lib/password-hasher.js';
import { createSessionCookies } from './lib/session-cookies.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import { corsAllowlist, securityHeaders } from './middleware/security.js';
import type { Repositories } from './repositories/index.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createAuditService } from './services/audit.service.js';
import { createAuthService } from './services/auth.service.js';
import { createHealthService, type ReadinessCheck } from './services/health.service.js';
import { createRateLimitService, type RateLimitPolicy } from './services/rate-limit.service.js';
import { createTokenService } from './services/token.service.js';

/** JSON bodies are small (credentials, a note edit). Audio takes a separate multipart route. */
const JSON_BODY_LIMIT = '100kb';

const RATE_LIMITS = {
  credentials: { name: 'auth-credentials', limit: 10, windowSec: 5 * 60 },
  session: { name: 'auth-session', limit: 60, windowSec: 5 * 60 },
  guest: { name: 'auth-guest', limit: 5, windowSec: 60 * 60 },
} satisfies Record<string, RateLimitPolicy>;

export type AppDependencies = {
  logger: Logger;
  repositories: Repositories;
  readinessChecks: readonly ReadinessCheck[];
  corsAllowedOrigins: readonly string[];
  /** See `TRUST_PROXY_HOPS` in the env schema. */
  trustProxyHops: number;
  accessTokenSecret: string;
  /** False only for local development over plain HTTP. */
  secureCookies: boolean;
  /** Lowered in tests, where hashing speed matters more than strength. */
  passwordHashCost?: number;
  /** The clock, injectable so tests can move time. */
  now?: () => Date;
};

/**
 * Composition root. Builds the Express app without binding a port, so the same
 * app runs under the local Node server, Supertest and the serverless entry point.
 */
export function createApp({
  logger,
  repositories,
  readinessChecks,
  corsAllowedOrigins,
  trustProxyHops,
  accessTokenSecret,
  secureCookies,
  passwordHashCost = DEFAULT_BCRYPT_COST,
  now = () => new Date(),
}: AppDependencies): Express {
  const app = express();
  app.set('trust proxy', trustProxyHops);

  // First, so that every later middleware and every error has a request id and logger.
  app.use(requestContext(logger));
  app.use(securityHeaders());
  app.use(corsAllowlist(corsAllowedOrigins));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const healthService = createHealthService({ checks: readinessChecks });
  app.use(createHealthRouter(createHealthController(healthService)));

  const cookies = createSessionCookies({ secure: secureCookies, now });
  const tokens = createTokenService({ accessTokenSecret, now });
  const audit = createAuditService(repositories.audit);
  const rateLimits = createRateLimitService(repositories.rateLimits, now);
  const authService = createAuthService({
    users: repositories.users,
    refreshTokens: repositories.refreshTokens,
    tokens,
    hasher: createPasswordHasher(passwordHashCost),
    audit,
    now,
  });
  const requireUser = authenticate({ tokens, cookies, allowedOrigins: corsAllowedOrigins });

  const v1 = Router();
  v1.use(
    '/auth',
    createAuthRouter({
      controller: createAuthController(authService, cookies),
      authenticate: requireUser,
      limiters: {
        credentials: rateLimit(rateLimits, RATE_LIMITS.credentials),
        session: rateLimit(rateLimits, RATE_LIMITS.session),
        guest: rateLimit(rateLimits, RATE_LIMITS.guest),
      },
    }),
  );
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
