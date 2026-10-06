import { Router, type RequestHandler } from 'express';

import type { AccountController } from '../controllers/account.controller.js';

export function createAccountRouter(
  controller: AccountController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.delete('/', authenticate, controller.delete);

  return router;
}
