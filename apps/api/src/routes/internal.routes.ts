import { Router, type RequestHandler } from 'express';

import type { RetentionController } from '../controllers/retention.controller.js';

/** Routes for the platform, not for clients. They are outside `/v1` and absent from the API docs. */
export function createInternalRouter(
  retention: RetentionController,
  requireCronSecret: RequestHandler,
): Router {
  const router = Router();

  // GET, because that is the method Vercel Cron uses.
  router.get('/cron/retention', requireCronSecret, retention.run);

  return router;
}
