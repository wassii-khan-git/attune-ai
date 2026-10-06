import { Router, type RequestHandler } from 'express';

import type { GenerationController } from '../controllers/generation.controller.js';
import type { VisitController } from '../controllers/visit.controller.js';

export type VisitRouterOptions = {
  visits: VisitController;
  generation: GenerationController;
  authenticate: RequestHandler;
  audioUpload: RequestHandler;
  limiters: {
    /** Creating, editing and deleting visits. */
    writes: RequestHandler;
    /** Uploading a recording. */
    uploads: RequestHandler;
  };
};

export function createVisitRouter({
  visits,
  generation,
  authenticate,
  audioUpload,
  limiters,
}: VisitRouterOptions): Router {
  const router = Router();

  // Every visit route requires a signed-in caller; ownership is enforced in the queries.
  router.use(authenticate);

  router.post('/', limiters.writes, visits.create);
  router.get('/', visits.list);
  router.get('/:id', visits.get);
  // PUT: the body is the whole note, so an autosave can be retried safely.
  router.put('/:id/note', limiters.writes, visits.updateNote);
  router.delete('/:id', limiters.writes, visits.delete);

  // Multipart upload in, newline-delimited JSON events out. The limiter runs
  // before the upload is read, so a throttled caller cannot make the server
  // buffer megabytes first.
  router.post('/:id/process', limiters.uploads, audioUpload, generation.process);

  return router;
}
