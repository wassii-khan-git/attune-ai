import { authResponseSchema, retentionResponseSchema, visitResponseSchema } from '@attune/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createTestApp, TEST_CRON_SECRET, type TestApp } from '../testing/test-app.js';

const HOUR = 60 * 60 * 1000;
const CRON = `Bearer ${TEST_CRON_SECRET}`;

function runRetention(app: TestApp['app'], authorization: string | null = CRON) {
  const call = request(app).get('/internal/cron/retention');
  return authorization === null ? call : call.set('Authorization', authorization);
}

async function createGuestWithVisit(app: TestApp['app']) {
  const session = await request(app).post('/v1/auth/guest').set('X-Token-Transport', 'body');
  const { user, tokens } = authResponseSchema.parse(session.body);
  const visit = await request(app)
    .post('/v1/visits')
    .set('Authorization', `Bearer ${tokens?.accessToken ?? ''}`)
    .send({ title: 'Guest visit', consentGiven: true });
  return { userId: user.id, visitId: visitResponseSchema.parse(visit.body).visit.id };
}

describe('GET /internal/cron/retention', () => {
  it.each([
    ['no credentials', null],
    ['a wrong secret', 'Bearer not-the-secret'],
    ['the secret without the Bearer prefix', TEST_CRON_SECRET],
    ['a prefix of the secret', CRON.slice(0, -1)],
  ])('looks like a missing route to a caller with %s', async (_label, authorization) => {
    const { app, repositories } = createTestApp();
    await createGuestWithVisit(app);

    const response = await runRetention(app, authorization);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(repositories.users.records).toHaveLength(1);
  });

  it('deletes guests older than 24 hours with their visits and sessions, and nothing younger', async () => {
    const { app, repositories, clock } = createTestApp();
    const old = await createGuestWithVisit(app);
    clock.advance(2 * HOUR);
    const recent = await createGuestWithVisit(app);
    clock.advance(23 * HOUR);

    const response = await runRetention(app);

    expect(response.status).toBe(200);
    expect(retentionResponseSchema.parse(response.body).purged.guestAccounts).toBe(1);
    expect(repositories.users.records.map((user) => user.id)).toEqual([recent.userId]);
    expect(repositories.visits.records.map((visit) => visit.id)).toEqual([recent.visitId]);
    expect(
      repositories.refreshTokens.records.every((token) => token.userId === recent.userId),
    ).toBe(true);
    expect(repositories.audit.events.at(-1)).toEqual({
      actorId: null,
      action: 'ACCOUNT_DELETED',
      resourceType: 'USER',
      resourceId: old.userId,
    });
  });

  it('never deletes a registered account, however old', async () => {
    const { app, repositories, clock } = createTestApp();
    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'synthetic-passphrase-1' });
    clock.advance(30 * 24 * HOUR);

    const response = await runRetention(app);

    expect(retentionResponseSchema.parse(response.body).purged.guestAccounts).toBe(0);
    expect(repositories.users.records).toHaveLength(1);
  });

  it('removes expired refresh tokens and stale rate-limit counters', async () => {
    const { app, repositories, clock } = createTestApp();
    await request(app)
      .post('/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'synthetic-passphrase-1' });
    expect(repositories.refreshTokens.records).toHaveLength(1);
    expect(repositories.rateLimits.size()).toBe(1);
    clock.advance(8 * 24 * HOUR);

    const response = await runRetention(app);

    expect(retentionResponseSchema.parse(response.body).purged).toEqual({
      guestAccounts: 0,
      refreshTokens: 1,
      rateLimitBuckets: 1,
    });
    expect(repositories.refreshTokens.records).toHaveLength(0);
    expect(repositories.rateLimits.size()).toBe(0);
  });

  it('is safe to run twice in a row', async () => {
    const { app, repositories, clock } = createTestApp();
    await createGuestWithVisit(app);
    clock.advance(25 * HOUR);

    const first = await runRetention(app);
    const second = await runRetention(app);

    expect(retentionResponseSchema.parse(first.body).purged.guestAccounts).toBe(1);
    expect(retentionResponseSchema.parse(second.body).purged).toEqual({
      guestAccounts: 0,
      refreshTokens: 0,
      rateLimitBuckets: 0,
    });
    expect(
      repositories.audit.events.filter((event) => event.action === 'ACCOUNT_DELETED'),
    ).toHaveLength(1);
  });

  it('logs counts only', async () => {
    const { app, logs, clock } = createTestApp();
    const guest = await createGuestWithVisit(app);
    clock.advance(25 * HOUR);

    await runRetention(app);

    expect(logs.entries()).toContainEqual(
      expect.objectContaining({
        msg: 'retention run completed',
        // The guest's session went with the account, through the cascade.
        purged: { guestAccounts: 1, refreshTokens: 0, rateLimitBuckets: 1 },
      }),
    );
    expect(logs.raw()).not.toContain(guest.userId);
    expect(logs.raw()).not.toContain(TEST_CRON_SECRET);
  });
});
