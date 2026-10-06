import type { RetentionResponse } from '@attune/shared';
import type { Request, Response } from 'express';

import type { RetentionService } from '../services/retention.service.js';

export type RetentionController = {
  run: (req: Request, res: Response) => Promise<void>;
};

export function createRetentionController(service: RetentionService): RetentionController {
  return {
    run: async (req, res) => {
      const purged = await service.purgeExpired();
      // Counts only, so the scheduler's log shows the job worked without naming anyone.
      req.log.info({ purged }, 'retention run completed');
      const body: RetentionResponse = { purged };
      res.set('Cache-Control', 'no-store').json(body);
    },
  };
}
