import type { Request, Response } from 'express';

import type { HealthService } from '../services/health.service.js';

export type HealthController = {
  live: (req: Request, res: Response) => void;
  ready: (req: Request, res: Response) => Promise<void>;
};

export function createHealthController(service: HealthService): HealthController {
  return {
    live: (_req, res) => {
      res.set('Cache-Control', 'no-store').status(200).json(service.liveness());
    },

    ready: async (_req, res) => {
      const result = await service.readiness();
      res
        .set('Cache-Control', 'no-store')
        .status(result.status === 'ready' ? 200 : 503)
        .json(result);
    },
  };
}
