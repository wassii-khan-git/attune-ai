import {
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  type AuthResponse,
  type MeResponse,
  type SessionResponse,
} from '@attune/shared';
import type { Request, Response } from 'express';

import { parseRequest } from '../lib/validation.js';

import { requireAuth } from '../middleware/authenticate.js';
import type { SessionCookies } from '../lib/session-cookies.js';
import type { AuthService, Session } from '../services/auth.service.js';

type Handler = (req: Request, res: Response) => Promise<void>;

export type AuthController = {
  register: Handler;
  login: Handler;
  guest: Handler;
  refresh: Handler;
  logout: Handler;
  me: Handler;
  session: Handler;
};

const TOKEN_TRANSPORT_HEADER = 'x-token-transport';

/**
 * Native clients ask for tokens in the response body and store them in the
 * platform keychain. A browser must never get them that way, because script
 * could then read them. Browsers always send `Origin` on these requests and
 * native clients do not, so its presence overrides the header.
 */
function wantsTokensInBody(req: Request): boolean {
  return req.get(TOKEN_TRANSPORT_HEADER) === 'body' && req.get('origin') === undefined;
}

export function createAuthController(
  service: AuthService,
  cookies: SessionCookies,
): AuthController {
  function sendSession(req: Request, res: Response, status: number, session: Session): void {
    const body: AuthResponse = {
      user: session.user,
      accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    };

    if (wantsTokensInBody(req)) {
      body.tokens = { accessToken: session.accessToken, refreshToken: session.refreshToken };
    } else {
      cookies.set(res, session);
    }
    // Responses that carry or accompany credentials must never be stored by a cache.
    res.set('Cache-Control', 'no-store').status(status).json(body);
  }

  return {
    register: async (req, res) => {
      const input = parseRequest(registerRequestSchema, req.body);
      sendSession(req, res, 201, await service.register(input));
    },

    login: async (req, res) => {
      const input = parseRequest(loginRequestSchema, req.body);
      sendSession(req, res, 200, await service.login(input));
    },

    guest: async (req, res) => {
      sendSession(req, res, 201, await service.createGuest());
    },

    refresh: async (req, res) => {
      const body = parseRequest(refreshRequestSchema, req.body ?? {});
      try {
        const session = await service.refresh(body.refreshToken ?? cookies.read(req).refreshToken);
        sendSession(req, res, 200, session);
      } catch (error) {
        // A refused refresh ends the browser session too, so stale cookies are not retried forever.
        cookies.clear(res);
        throw error;
      }
    },

    logout: async (req, res) => {
      const body = parseRequest(refreshRequestSchema, req.body ?? {});
      await service.logout(body.refreshToken ?? cookies.read(req).refreshToken);
      cookies.clear(res);
      res.status(204).end();
    },

    session: async (req, res) => {
      const header = req.get('authorization');
      const stored = cookies.read(req);
      const accessToken =
        header?.startsWith('Bearer ') === true ? header.slice(7) : stored.accessToken;

      const user = await service.findSessionUser(accessToken);
      const body: SessionResponse = {
        user,
        canRefresh: user === null && stored.refreshToken !== undefined,
      };
      res.set('Cache-Control', 'no-store').json(body);
    },

    me: async (req, res) => {
      const body: MeResponse = { user: await service.getUser(requireAuth(req).userId) };
      res.set('Cache-Control', 'no-store').json(body);
    },
  };
}
