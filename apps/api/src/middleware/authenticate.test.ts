import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createSessionCookies } from '../lib/session-cookies.js';
import { createTokenService } from '../services/token.service.js';
import { captureLogs } from '../testing/log-capture.js';
import { ALLOWED_ORIGIN, TEST_ACCESS_TOKEN_SECRET } from '../testing/test-app.js';
import { authenticate, requireAuth } from './authenticate.js';
import { errorHandler } from './error-handler.js';
import { requestContext } from './request-context.js';

const tokens = createTokenService({
  accessTokenSecret: TEST_ACCESS_TOKEN_SECRET,
  now: () => new Date(),
});
const cookies = createSessionCookies({ secure: false, now: () => new Date() });

/** A state-changing route behind `authenticate`, to exercise the origin check. */
function protectedApp() {
  const app = express();
  app.use(requestContext(captureLogs().logger));
  app.post(
    '/change',
    authenticate({ tokens, cookies, allowedOrigins: [ALLOWED_ORIGIN] }),
    (req, res) => {
      res.json({ userId: requireAuth(req).userId });
    },
  );
  app.post('/unprotected', (req, res) => {
    res.json({ userId: requireAuth(req).userId });
  });
  app.use(errorHandler);
  return app;
}

async function accessToken(): Promise<string> {
  const { token } = await tokens.issueAccessToken({
    userId: 'user-1',
    role: 'USER',
    isGuest: false,
  });
  return token;
}

describe('authenticate', () => {
  it('accepts a cookie-authenticated change from an allowlisted origin', async () => {
    const response = await request(protectedApp())
      .post('/change')
      .set('Cookie', `attune_access=${await accessToken()}`)
      .set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: 'user-1' });
  });

  it('refuses a cookie-authenticated change from any other origin', async () => {
    const response = await request(protectedApp())
      .post('/change')
      .set('Cookie', `attune_access=${await accessToken()}`)
      .set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('accepts a cookie-authenticated change that carries no origin, as non-browser clients send', async () => {
    const response = await request(protectedApp())
      .post('/change')
      .set('Cookie', `attune_access=${await accessToken()}`);

    expect(response.status).toBe(200);
  });

  it('does not apply the origin check to bearer tokens, which browsers never attach on their own', async () => {
    const response = await request(protectedApp())
      .post('/change')
      .set('Authorization', `Bearer ${await accessToken()}`)
      .set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(200);
  });

  it('prefers a bearer token over a cookie and rejects it if invalid', async () => {
    const response = await request(protectedApp())
      .post('/change')
      .set('Authorization', 'Bearer not-a-token')
      .set('Cookie', `attune_access=${await accessToken()}`);

    expect(response.status).toBe(401);
  });

  it('makes requireAuth fail closed on a route wired without the middleware', async () => {
    const response = await request(protectedApp())
      .post('/unprotected')
      .set('Authorization', `Bearer ${await accessToken()}`);

    expect(response.status).toBe(401);
  });
});
