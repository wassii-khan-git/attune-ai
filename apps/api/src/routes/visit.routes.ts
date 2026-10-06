import { Router, type RequestHandler } from 'express';

import type { VisitController } from '../controllers/visit.controller.js';

export function createVisitRouter(
  controller: VisitController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  // Every visit route requires a signed-in caller; ownership is enforced in the queries.
  router.use(authenticate);

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  // PUT: the body is the whole note, so an autosave can be retried safely.
  router.put('/:id/note', controller.updateNote);
  router.delete('/:id', controller.delete);

  return router;
}
