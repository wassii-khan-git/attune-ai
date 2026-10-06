import {
  apiErrorSchema,
  authResponseSchema,
  meResponseSchema,
  sessionResponseSchema,
} from '@attune/shared';
import request, { type Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { ALLOWED_ORIGIN, createTestApp, type TestApp } from '../testing/test-app.js';

// Synthetic credentials.
const credentials = { email: 'clinician@example.com', password: 'synthetic-passphrase-1' };

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function setCookies(response: Response): string[] {
  return response.get('Set-Cookie') ?? [];
}

function cookieNamed(response: Response, name: string): string | undefined {
  return setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
}

function errorCode(response: Response): string {
  return apiErrorSchema.parse(response.body).error.code;
}

/** Registers through the API as a native client, so the tokens come back in the body. */
async function registerNative(app: TestApp['app'], overrides: Partial<typeof credentials> = {}) {
  const response = await request(app)
    .post('/v1/auth/register')
    .set('X-Token-Transport', 'body')
    .send({ ...credentials, ...overrides });
  const body = authResponseSchema.parse(response.body);
  if (body.tokens === undefined) {
    throw new Error('Expected tokens in the response body');
  }
  return { user: body.user, tokens: body.tokens };
}

describe('POST /v1/auth/register', () => {
  it('creates the account and starts a session in httpOnly cookies', async () => {
    const { app, repositories } = createTestApp();

    const response = await request(app).post('/v1/auth/register').send(credentials);

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = authResponseSchema.parse(response.body);
    expect(body.user).toMatchObject({ email: credentials.email, role: 'USER', isGuest: false });
    expect(body.tokens).toBeUndefined();

    const access = cookieNamed(response, 'attune_access');
    const refresh = cookieNamed(response, 'attune_refresh');
    expect(access).toMatch(/; Max-Age=900; Path=\/; .*HttpOnly; SameSite=Lax/);
    expect(refresh).toMatch(/; Max-Age=604800; Path=\/v1\/auth; .*HttpOnly; SameSite=Lax/);
    expect(access).not.toContain('Secure');

    expect(repositories.audit.events).toEqual([
      {
        actorId: body.user.id,
        action: 'USER_REGISTERED',
        resourceType: 'USER',
        resourceId: body.user.id,
      },
    ]);
  });

  it('stores a bcrypt hash, never the password, and only a hash of the refresh token', async () => {
    const { app, repositories } = createTestApp();

    const { tokens } = await registerNative(app);

    const stored = repositories.users.records[0];
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$04\$/);
    expect(JSON.stringify(repositories.users.records)).not.toContain(credentials.password);
    expect(JSON.stringify(repositories.refreshTokens.records)).not.toContain(tokens.refreshToken);
  });

  it('marks the cookies Secure outside local development', async () => {
    const { app } = createTestApp({ secureCookies: true });

    const response = await request(app).post('/v1/auth/register').send(credentials);

    expect(cookieNamed(response, 'attune_access')).toContain('; Secure');
    expect(cookieNamed(response, 'attune_refresh')).toContain('; Secure');
  });

  it('treats differently cased and padded emails as the same account', async () => {
    const { app } = createTestApp();
    await request(app).post('/v1/auth/register').send(credentials);

    const response = await request(app)
      .post('/v1/auth/register')
      .send({ ...credentials, email: '  Clinician@Example.COM ' });

    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('EMAIL_TAKEN');
  });

  it('rejects a short password and names the field without echoing the value', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/v1/auth/register')
      .send({ email: credentials.email, password: 'short-pw' });

    expect(response.status).toBe(400);
    const { error } = apiErrorSchema.parse(response.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.map((detail) => detail.path)).toEqual(['password']);
    expect(response.text).not.toContain('short-pw');
  });

  it('rejects a password that bcrypt would silently truncate', async () => {
    const { app } = createTestApp();
    // 30 characters, 90 bytes: within the character limit, beyond bcrypt's 72 bytes.
    const password = '€'.repeat(30);

    const response = await request(app)
      .post('/v1/auth/register')
      .send({ email: credentials.email, password });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing body', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/v1/auth/register');

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });
});

describe('POST /v1/auth/login', () => {
  it('starts a session for the right password and records it', async () => {
    const { app, repositories } = createTestApp();
    const { user } = await registerNative(app);

    const response = await request(app).post('/v1/auth/login').send(credentials);

    expect(response.status).toBe(200);
    expect(authResponseSchema.parse(response.body).user.id).toBe(user.id);
    expect(cookieNamed(response, 'attune_access')).toBeDefined();
    expect(repositories.audit.events.at(-1)).toMatchObject({
      actorId: user.id,
      action: 'USER_LOGGED_IN',
    });
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { app } = createTestApp();
    await registerNative(app);

    const wrongPassword = await request(app)
      .post('/v1/auth/login')
      .send({ ...credentials, password: 'not-the-passphrase' });
    const unknownEmail = await request(app)
      .post('/v1/auth/login')
      .send({ ...credentials, email: 'nobody@example.com' });

    expect(wrongPassword.status).toBe(401);
    expect(errorCode(wrongPassword)).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(setCookies(wrongPassword)).toEqual([]);
  });
});

describe('traces left by refused sign-ins', () => {
  it('audits a wrong password against the account and logs why, without the email', async () => {
    const { app, repositories, logs } = createTestApp();
    const { user } = await registerNative(app);

    await request(app)
      .post('/v1/auth/login')
      .send({ ...credentials, password: 'not-the-passphrase' });

    expect(repositories.audit.events.at(-1)).toEqual({
      actorId: null,
      action: 'LOGIN_FAILED',
      resourceType: 'USER',
      resourceId: user.id,
    });
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        msg: 'request refused',
        reason: 'invalid_credentials',
        userId: user.id,
      }),
    );
    expect(logs.raw()).not.toContain(credentials.email);
    expect(logs.raw()).not.toContain('not-the-passphrase');
  });

  it('logs an attempt on an unknown email without creating an audit row', async () => {
    const { app, repositories, logs } = createTestApp();

    await request(app).post('/v1/auth/login').send(credentials);

    expect(repositories.audit.events).toEqual([]);
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ msg: 'request refused', reason: 'invalid_credentials' }),
    );
    expect(logs.raw()).not.toContain(credentials.email);
  });

  it('audits and logs a replayed refresh token as a forced sign-out', async () => {
    const { app, repositories, logs } = createTestApp();
    const { user, tokens } = await registerNative(app);
    const refresh = (refreshToken: string) =>
      request(app).post('/v1/auth/refresh').send({ refreshToken });
    await refresh(tokens.refreshToken);

    await refresh(tokens.refreshToken);

    expect(repositories.audit.events.at(-1)).toEqual({
      actorId: null,
      action: 'SESSIONS_REVOKED',
      resourceType: 'USER',
      resourceId: user.id,
    });
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        reason: 'refresh_token_replayed',
        userId: user.id,
      }),
    );
    expect(logs.raw()).not.toContain(tokens.refreshToken);
  });

  it('logs which limit a throttled caller hit', async () => {
    const { app, logs } = createTestApp();
    for (let i = 0; i < 6; i++) {
      await request(app).post('/v1/auth/guest');
    }

    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ msg: 'request refused', reason: 'rate_limited:auth-guest' }),
    );
  });
});

describe('POST /v1/auth/guest', () => {
  it('creates a temporary account without credentials', async () => {
    const { app, repositories } = createTestApp();

    const response = await request(app).post('/v1/auth/guest');

    expect(response.status).toBe(201);
    const { user } = authResponseSchema.parse(response.body);
    expect(user).toMatchObject({ email: null, isGuest: true });
    expect(repositories.audit.events).toEqual([
      { actorId: user.id, action: 'GUEST_CREATED', resourceType: 'USER', resourceId: user.id },
    ]);
  });

  it('gives a guest session that cannot be refreshed past 24 hours', async () => {
    const { app, clock } = createTestApp();
    const agent = request.agent(app);
    await agent.post('/v1/auth/guest');

    clock.advance(23 * 60 * MINUTE);
    const early = await agent.post('/v1/auth/refresh');
    clock.advance(2 * 60 * MINUTE);
    const late = await agent.post('/v1/auth/refresh');

    expect(early.status).toBe(200);
    expect(late.status).toBe(401);
  });
});

describe('GET /v1/auth/me', () => {
  it('identifies a browser by its session cookie', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    await agent.post('/v1/auth/register').send(credentials);

    const response = await agent.get('/v1/auth/me');

    expect(response.status).toBe(200);
    expect(meResponseSchema.parse(response.body).user.email).toBe(credentials.email);
    expect(response.text).not.toContain('passwordHash');
  });

  it('identifies a native client by its bearer token', async () => {
    const { app } = createTestApp();
    const { tokens, user } = await registerNative(app);

    const response = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(response.status).toBe(200);
    expect(meResponseSchema.parse(response.body).user.id).toBe(user.id);
  });

  it('rejects a request with no credentials', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/v1/auth/me');

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });

  it('rejects a token whose payload was altered', async () => {
    const { app } = createTestApp();
    const { tokens } = await registerNative(app);
    const [header, , signature] = tokens.accessToken.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'someone-else', role: 'ADMIN', guest: false }),
    ).toString('base64url');

    const response = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${String(header)}.${forgedPayload}.${String(signature)}`);

    expect(response.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const issuer = createTestApp({ accessTokenSecret: 'a-different-secret-0123456789-abcdefgh' });
    const { tokens } = await registerNative(issuer.app);
    const { app } = createTestApp();

    const response = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(response.status).toBe(401);
  });

  it('rejects an unsigned token', async () => {
    const { app } = createTestApp();
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none' })}.${encode({ sub: 'x', role: 'ADMIN', guest: false })}.`;

    const response = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${unsigned}`);

    expect(response.status).toBe(401);
  });

  it('rejects an access token after 15 minutes', async () => {
    const { app, clock } = createTestApp();
    const { tokens } = await registerNative(app);
    const me = () =>
      request(app).get('/v1/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`);

    clock.advance(14 * MINUTE);
    const before = await me();
    clock.advance(2 * MINUTE);
    const after = await me();

    expect(before.status).toBe(200);
    expect(after.status).toBe(401);
  });

  it('rejects a still-valid token once its account is gone', async () => {
    const { app, repositories } = createTestApp();
    const { tokens, user } = await registerNative(app);
    repositories.users.remove(user.id);

    const response = await request(app)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(response.status).toBe(401);
  });
});

describe('GET /v1/auth/session', () => {
  const session = async (call: request.Test) => sessionResponseSchema.parse((await call).body);

  it('answers a visitor with 200 and no user, so a page load causes no failed request', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/v1/auth/session');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sessionResponseSchema.parse(response.body)).toEqual({ user: null, canRefresh: false });
  });

  it('returns the user for a browser session and for a bearer token', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    await agent.post('/v1/auth/register').send(credentials);
    const native = await registerNative(app, { email: 'second@example.com' });

    expect((await session(agent.get('/v1/auth/session'))).user?.email).toBe(credentials.email);
    expect(
      (
        await session(
          request(app)
            .get('/v1/auth/session')
            .set('Authorization', `Bearer ${native.tokens.accessToken}`),
        )
      ).user?.id,
    ).toBe(native.user.id);
  });

  it('says a refresh is worth trying when the access token has expired but a refresh token remains', async () => {
    const { app, clock } = createTestApp();
    const agent = request.agent(app);
    const registered = await agent.post('/v1/auth/register').send(credentials);
    const refreshCookie = cookieNamed(registered, 'attune_refresh')?.split(';')[0] ?? '';
    clock.advance(16 * MINUTE);

    // The agent has dropped the expired access cookie; only the refresh cookie is sent.
    const result = await session(request(app).get('/v1/auth/session').set('Cookie', refreshCookie));

    expect(result).toEqual({ user: null, canRefresh: true });
  });

  it('treats a forged token and a deleted account as nobody, without an error', async () => {
    const { app, repositories } = createTestApp();
    const { tokens, user } = await registerNative(app);
    repositories.users.remove(user.id);

    const forged = await request(app)
      .get('/v1/auth/session')
      .set('Cookie', 'attune_access=not-a-token');
    const orphaned = await request(app)
      .get('/v1/auth/session')
      .set('Authorization', `Bearer ${tokens.accessToken}`);

    expect(forged.status).toBe(200);
    expect(sessionResponseSchema.parse(forged.body).user).toBeNull();
    expect(orphaned.status).toBe(200);
    expect(sessionResponseSchema.parse(orphaned.body).user).toBeNull();
  });
});

describe('POST /v1/auth/refresh', () => {
  it('issues a new session and retires the old refresh token', async () => {
    const { app } = createTestApp();
    const { tokens } = await registerNative(app);
    const refresh = (refreshToken: string) =>
      request(app).post('/v1/auth/refresh').set('X-Token-Transport', 'body').send({ refreshToken });

    const first = await refresh(tokens.refreshToken);

    expect(first.status).toBe(200);
    const rotated = authResponseSchema.parse(first.body).tokens;
    expect(rotated?.refreshToken).toBeDefined();
    expect(rotated?.refreshToken).not.toBe(tokens.refreshToken);
  });

  it('rotates the cookies for a browser', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    const registered = await agent.post('/v1/auth/register').send(credentials);

    const refreshed = await agent.post('/v1/auth/refresh');
    const me = await agent.get('/v1/auth/me');

    expect(refreshed.status).toBe(200);
    expect(cookieNamed(refreshed, 'attune_refresh')).not.toBe(
      cookieNamed(registered, 'attune_refresh'),
    );
    expect(me.status).toBe(200);
  });

  it('ends every session of the user when a retired token is replayed', async () => {
    const { app } = createTestApp();
    const { tokens } = await registerNative(app);
    const refresh = (refreshToken: string) =>
      request(app).post('/v1/auth/refresh').set('X-Token-Transport', 'body').send({ refreshToken });
    const rotated = authResponseSchema.parse((await refresh(tokens.refreshToken)).body).tokens;

    const replay = await refresh(tokens.refreshToken);
    const afterReplay = await refresh(rotated?.refreshToken ?? '');

    expect(replay.status).toBe(401);
    expect(errorCode(replay)).toBe('UNAUTHENTICATED');
    expect(afterReplay.status).toBe(401);
  });

  it('rejects a refresh token after 7 days', async () => {
    const { app, clock } = createTestApp();
    const { tokens } = await registerNative(app);

    clock.advance(7 * DAY + MINUTE);
    const response = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });

    expect(response.status).toBe(401);
  });

  it('rejects an unknown token and clears the browser cookies', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/v1/auth/refresh')
      .set('Cookie', 'attune_refresh=not-a-real-token');

    expect(response.status).toBe(401);
    expect(cookieNamed(response, 'attune_access')).toMatch(/^attune_access=;/);
    expect(cookieNamed(response, 'attune_refresh')).toMatch(/^attune_refresh=;/);
  });

  it('rejects a request with no refresh token at all', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/v1/auth/refresh');

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });
});

describe('POST /v1/auth/logout', () => {
  it('revokes the session, clears the cookies and records it', async () => {
    const { app, repositories } = createTestApp();
    const agent = request.agent(app);
    const registered = await agent.post('/v1/auth/register').send(credentials);
    const refreshCookie = cookieNamed(registered, 'attune_refresh')?.split(';')[0] ?? '';

    const response = await agent.post('/v1/auth/logout');

    expect(response.status).toBe(204);
    expect(cookieNamed(response, 'attune_refresh')).toMatch(/^attune_refresh=;/);
    expect(repositories.audit.events.at(-1)).toMatchObject({ action: 'USER_LOGGED_OUT' });

    const reuse = await request(app).post('/v1/auth/refresh').set('Cookie', refreshCookie);
    expect(reuse.status).toBe(401);
  });

  it('succeeds again when there is no session left to end', async () => {
    const { app, repositories } = createTestApp();
    const agent = request.agent(app);
    await agent.post('/v1/auth/register').send(credentials);
    await agent.post('/v1/auth/logout');

    const response = await agent.post('/v1/auth/logout');

    expect(response.status).toBe(204);
    expect(
      repositories.audit.events.filter((event) => event.action === 'USER_LOGGED_OUT'),
    ).toHaveLength(1);
  });
});

describe('token transport', () => {
  it('returns tokens in the body to a native client and sets no cookies', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/v1/auth/register')
      .set('X-Token-Transport', 'body')
      .send(credentials);

    expect(authResponseSchema.parse(response.body).tokens).toBeDefined();
    expect(setCookies(response)).toEqual([]);
  });

  it('never returns tokens in the body to a browser, even if a script asks', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/v1/auth/register')
      .set('Origin', ALLOWED_ORIGIN)
      .set('X-Token-Transport', 'body')
      .send(credentials);

    expect(response.status).toBe(201);
    expect(authResponseSchema.parse(response.body).tokens).toBeUndefined();
    expect(cookieNamed(response, 'attune_access')).toBeDefined();
  });
});

describe('rate limiting', () => {
  it('throttles sign-in attempts per caller and recovers when the window ends', async () => {
    const { app, clock } = createTestApp();
    const attempt = () => request(app).post('/v1/auth/login').send(credentials);

    for (let i = 0; i < 10; i++) {
      expect((await attempt()).status).toBe(401);
    }
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect(errorCode(blocked)).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(300);

    clock.advance(5 * MINUTE);
    expect((await attempt()).status).toBe(401);
  });

  it('limits guest creation more tightly', async () => {
    const { app } = createTestApp();

    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/v1/auth/guest')).status).toBe(201);
    }

    expect((await request(app).post('/v1/auth/guest')).status).toBe(429);
  });

  it('counts callers behind a trusted proxy separately', async () => {
    const { app } = createTestApp({ trustProxyHops: 1 });
    const guestFrom = (address: string) =>
      request(app).post('/v1/auth/guest').set('X-Forwarded-For', address);

    for (let i = 0; i < 5; i++) {
      await guestFrom('203.0.113.10');
    }

    expect((await guestFrom('203.0.113.10')).status).toBe(429);
    expect((await guestFrom('203.0.113.11')).status).toBe(201);
  });
});

describe('rate limiting behind the web app', () => {
  const secret = 'test-only-web-proxy-secret-0123456789abc';
  const guestFor = (app: Parameters<typeof request>[0], address: string, proxySecret = secret) =>
    request(app)
      .post('/v1/auth/guest')
      .set('x-attune-proxy-secret', proxySecret)
      .set('x-attune-client-ip', address);

  it('counts each browser separately when the web app vouches for its address', async () => {
    const { app } = createTestApp({ webProxySecret: secret });
    for (let i = 0; i < 5; i++) {
      await guestFor(app, '203.0.113.10');
    }

    expect((await guestFor(app, '203.0.113.10')).status).toBe(429);
    expect((await guestFor(app, '203.0.113.11')).status).toBe(201);
  });

  it('does not let a caller without the secret pick its own address', async () => {
    const { app } = createTestApp({ webProxySecret: secret });
    for (let i = 0; i < 5; i++) {
      await guestFor(app, `198.51.100.${String(i)}`, 'a-guess-at-the-secret-a-guess-at-it');
    }

    // Five different claimed addresses, one real connection: the limit still applies.
    expect(
      (await guestFor(app, '198.51.100.99', 'a-guess-at-the-secret-a-guess-at-it')).status,
    ).toBe(429);
  });
});

describe('logging', () => {
  it('keeps passwords, tokens and emails out of the logs', async () => {
    const { app, logs } = createTestApp();
    const { tokens } = await registerNative(app);
    await request(app).post('/v1/auth/login').send(credentials);
    await request(app)
      .post('/v1/auth/login')
      .send({ ...credentials, password: 'wrong-passphrase' });
    await request(app).get('/v1/auth/me').set('Authorization', `Bearer ${tokens.accessToken}`);

    const output = logs.raw();
    expect(logs.entries().length).toBeGreaterThanOrEqual(4);
    for (const secret of [
      credentials.password,
      'wrong-passphrase',
      credentials.email,
      tokens.accessToken,
      tokens.refreshToken,
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
