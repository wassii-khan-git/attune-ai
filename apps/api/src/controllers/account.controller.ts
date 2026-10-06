import type { Request, Response } from 'express';

import type { SessionCookies } from '../lib/session-cookies.js';
import { requireAuth } from '../middleware/authenticate.js';
import type { AccountService } from '../services/account.service.js';

export type AccountController = {
  delete: (req: Request, res: Response) => Promise<void>;
};

export function createAccountController(
  service: AccountService,
  cookies: SessionCookies,
): AccountController {
  return {
    delete: async (req, res) => {
      await service.deleteAccount(requireAuth(req).userId);
      cookies.clear(res);
      res.status(204).end();
    },
  };
}
