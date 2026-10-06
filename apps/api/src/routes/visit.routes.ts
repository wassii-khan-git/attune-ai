import { Router, type RequestHandler } from 'express';

import type { GenerationController } from '../controllers/generation.controller.js';
import type { VisitController } from '../controllers/visit.controller.js';

export type VisitRouterOptions = {
  visits: VisitController;
  generation: GenerationController;
  authenticate: RequestHandler;
  audioUpload: RequestHandler;
};

export function createVisitRouter({
  visits,
  generation,
  authenticate,
  audioUpload,
}: VisitRouterOptions): Router {
  const router = Router();

  // Every visit route requires a signed-in caller; ownership is enforced in the queries.
  router.use(authenticate);

  router.post('/', visits.create);
  router.get('/', visits.list);
  router.get('/:id', visits.get);
  // PUT: the body is the whole note, so an autosave can be retried safely.
  router.put('/:id/note', visits.updateNote);
  router.delete('/:id', visits.delete);

  // Multipart upload in, newline-delimited JSON events out.
  router.post('/:id/process', audioUpload, generation.process);

  return router;
}
