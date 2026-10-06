import { Router, type RequestHandler } from 'express';

import type { AuthController } from '../controllers/auth.controller.js';

export type AuthRouterOptions = {
  controller: AuthController;
  authenticate: RequestHandler;
  limiters: {
    /** Register and login: the routes that test a password. */
    credentials: RequestHandler;
    /** Refresh and logout: frequent and cheap. */
    session: RequestHandler;
    /** Guest creation: each call makes a database row, so it is the tightest. */
    guest: RequestHandler;
  };
};

export function createAuthRouter({
  controller,
  authenticate,
  limiters,
}: AuthRouterOptions): Router {
  const router = Router();

  router.post('/register', limiters.credentials, controller.register);
  router.post('/login', limiters.credentials, controller.login);
  router.post('/guest', limiters.guest, controller.guest);
  router.post('/refresh', limiters.session, controller.refresh);
  router.post('/logout', limiters.session, controller.logout);
  router.get('/me', authenticate, controller.me);

  return router;
}
