import { Router } from 'express';

import type { HealthController } from '../controllers/health.controller.js';

/** Probes are unversioned and sit outside `/v1`: they describe the deployment, not the API. */
export function createHealthRouter(controller: HealthController): Router {
  const router = Router();

  router.get('/health', controller.live);
  router.get('/ready', controller.ready);

  return router;
}
