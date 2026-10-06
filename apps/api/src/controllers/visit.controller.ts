import {
  createVisitRequestSchema,
  listVisitsQuerySchema,
  updateNoteRequestSchema,
  visitIdParamsSchema,
  type ListVisitsResponse,
  type VisitDetailResponse,
  type VisitResponse,
} from '@attune/shared';
import type { Request, Response } from 'express';

import { parseRequest } from '../lib/validation.js';

import { requireAuth } from '../middleware/authenticate.js';
import type { VisitService } from '../services/visit.service.js';

type Handler = (req: Request, res: Response) => Promise<void>;

export type VisitController = {
  create: Handler;
  list: Handler;
  get: Handler;
  updateNote: Handler;
  delete: Handler;
};

/** Visit responses hold clinical content or lead to it, so no cache may keep them. */
function noStore(res: Response): Response {
  return res.set('Cache-Control', 'no-store');
}

export function createVisitController(service: VisitService): VisitController {
  return {
    create: async (req, res) => {
      const owner = requireAuth(req);
      const input = parseRequest(createVisitRequestSchema, req.body);
      const body: VisitResponse = { visit: await service.create(owner, input) };
      noStore(res).status(201).json(body);
    },

    list: async (req, res) => {
      const { userId } = requireAuth(req);
      const query = parseRequest(listVisitsQuerySchema, req.query);
      const body: ListVisitsResponse = await service.list(userId, query);
      noStore(res).json(body);
    },

    get: async (req, res) => {
      const { userId } = requireAuth(req);
      const { id } = parseRequest(visitIdParamsSchema, req.params);
      const body: VisitDetailResponse = { visit: await service.get(userId, id) };
      noStore(res).json(body);
    },

    updateNote: async (req, res) => {
      const { userId } = requireAuth(req);
      const { id } = parseRequest(visitIdParamsSchema, req.params);
      const { note } = parseRequest(updateNoteRequestSchema, req.body);
      const body: VisitResponse = { visit: await service.updateNote(userId, id, note) };
      noStore(res).json(body);
    },

    delete: async (req, res) => {
      const { userId } = requireAuth(req);
      const { id } = parseRequest(visitIdParamsSchema, req.params);
      await service.delete(userId, id);
      res.status(204).end();
    },
  };
}
