import express, { Router, type Express } from 'express';

import type { ScribeModel } from './ai/scribe-model.js';
import { createAccountController } from './controllers/account.controller.js';
import { createAuthController } from './controllers/auth.controller.js';
import { createGenerationController } from './controllers/generation.controller.js';
import { createHealthController } from './controllers/health.controller.js';
import { createRetentionController } from './controllers/retention.controller.js';
import { createVisitController } from './controllers/visit.controller.js';
import { createFieldCipher } from './lib/field-cipher.js';
import type { Logger } from './lib/logger.js';
import { createPasswordHasher, DEFAULT_BCRYPT_COST } from './lib/password-hasher.js';
import { createSessionCookies } from './lib/session-cookies.js';
import { audioUpload } from './middleware/audio-upload.js';
import { authenticate } from './middleware/authenticate.js';
import { clientAddress } from './middleware/client-address.js';
import { requireCronSecret } from './middleware/cron-auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { byUser, rateLimit } from './middleware/rate-limit.js';
import { requestContext } from './middleware/request-context.js';
import { corsAllowlist, securityHeaders } from './middleware/security.js';
import { buildOpenApiDocument } from './openapi/document.js';
import type { Repositories } from './repositories/index.js';
import { createAccountRouter } from './routes/account.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createDocsRouter } from './routes/docs.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createInternalRouter } from './routes/internal.routes.js';
import { createVisitRouter } from './routes/visit.routes.js';
import { createAccountService } from './services/account.service.js';
import { createAuditService } from './services/audit.service.js';
import { createAuthService } from './services/auth.service.js';
import { createGenerationService } from './services/generation.service.js';
import { createHealthService, type ReadinessCheck } from './services/health.service.js';
import { createRateLimitService, type RateLimitPolicy } from './services/rate-limit.service.js';
import { createRetentionService } from './services/retention.service.js';
import { createTokenService } from './services/token.service.js';
import { createVisitService } from './services/visit.service.js';

/** JSON bodies are small (credentials, a note edit). Audio takes a separate multipart route. */
const JSON_BODY_LIMIT = '100kb';

const RATE_LIMITS = {
  credentials: { name: 'auth-credentials', limit: 10, windowSec: 5 * 60 },
  session: { name: 'auth-session', limit: 60, windowSec: 5 * 60 },
  guest: { name: 'auth-guest', limit: 5, windowSec: 60 * 60 },
  // Generous enough for an editor that autosaves every few seconds.
  visitWrites: { name: 'visit-writes', limit: 300, windowSec: 5 * 60 },
  visitUploads: { name: 'visit-uploads', limit: 20, windowSec: 5 * 60 },
} satisfies Record<string, RateLimitPolicy>;

export type AppDependencies = {
  logger: Logger;
  repositories: Repositories;
  readinessChecks: readonly ReadinessCheck[];
  corsAllowedOrigins: readonly string[];
  /** See `TRUST_PROXY_HOPS` in the env schema. */
  trustProxyHops: number;
  accessTokenSecret: string;
  /** Shared with the scheduler; guards the retention endpoint. */
  cronSecret: string;
  /** Shared with the web app. Without it, a forwarded client address is never believed. */
  webProxySecret?: string;
  /** 32 bytes. Encrypts transcripts and notes at field level. */
  fieldEncryptionKey: Buffer;
  /** Transcribes audio and drafts notes. Gemini in production, a scripted model in tests. */
  scribeModel: ScribeModel;
  /** Pause before a retried model call. Injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Gap between keep-alive lines in a streamed run. Shortened in tests. */
  streamKeepAliveMs?: number;
  /** False only for local development over plain HTTP. */
  secureCookies: boolean;
  /** Generations allowed per UTC day across all users. */
  dailyGenerationBudget: number;
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
  cronSecret,
  webProxySecret,
  fieldEncryptionKey,
  scribeModel,
  sleep,
  streamKeepAliveMs,
  secureCookies,
  dailyGenerationBudget,
  passwordHashCost = DEFAULT_BCRYPT_COST,
  now = () => new Date(),
}: AppDependencies): Express {
  const app = express();
  app.set('trust proxy', trustProxyHops);

  // First, so that every later middleware and every error has a request id and logger.
  app.use(requestContext(logger));
  app.use(clientAddress(webProxySecret));
  app.use(securityHeaders());
  app.use(corsAllowlist(corsAllowedOrigins));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  const healthService = createHealthService({ checks: readinessChecks });
  app.use(createHealthRouter(createHealthController(healthService)));
  app.use(createDocsRouter(buildOpenApiDocument()));

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
  const cipher = createFieldCipher(fieldEncryptionKey);
  v1.use(
    '/visits',
    createVisitRouter({
      visits: createVisitController(
        createVisitService({ visits: repositories.visits, cipher, audit, now }),
      ),
      generation: createGenerationController(
        createGenerationService({
          visits: repositories.visits,
          usage: repositories.usage,
          rateLimits,
          dailyBudget: dailyGenerationBudget,
          model: scribeModel,
          cipher,
          audit,
          now,
          ...(sleep === undefined ? {} : { sleep }),
        }),
        streamKeepAliveMs === undefined ? {} : { keepAliveMs: streamKeepAliveMs },
      ),
      authenticate: requireUser,
      audioUpload: audioUpload(),
      limiters: {
        writes: rateLimit(rateLimits, RATE_LIMITS.visitWrites, byUser),
        uploads: rateLimit(rateLimits, RATE_LIMITS.visitUploads, byUser),
      },
    }),
  );
  v1.use(
    '/account',
    createAccountRouter(
      createAccountController(createAccountService(repositories.users, audit), cookies),
      requireUser,
    ),
  );
  app.use('/v1', v1);

  app.use(
    '/internal',
    createInternalRouter(
      createRetentionController(
        createRetentionService({
          retention: repositories.retention,
          refreshTokens: repositories.refreshTokens,
          rateLimits: repositories.rateLimits,
          now,
        }),
      ),
      requireCronSecret(cronSecret),
    ),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
