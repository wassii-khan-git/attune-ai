import {
  apiErrorSchema,
  authResponseSchema,
  listVisitsResponseSchema,
  visitDetailResponseSchema,
  visitResponseSchema,
  type SoapNote,
  type Transcript,
} from '@attune/shared';
import request, { type Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { createFieldCipher } from '../lib/field-cipher.js';
import {
  ALLOWED_ORIGIN,
  createTestApp,
  TEST_FIELD_ENCRYPTION_KEY,
  type TestApp,
} from '../testing/test-app.js';

// Synthetic clinical text, used to prove it is neither stored in plaintext nor logged.
const note: SoapNote = {
  subjective: 'Dry cough for three days, worse at night.',
  objective: 'Temperature 36.8 C. Chest clear on auscultation.',
  assessment: 'Likely viral upper respiratory infection.',
  plan: 'Fluids and rest. Return if fever develops.',
};
const transcript: Transcript = [
  { speaker: 'Clinician', text: 'What brings you in today?' },
  { speaker: 'Patient', text: 'I have had a dry cough since Monday.' },
];

const UNKNOWN_ID = '0199a8f2-0000-7000-8000-00000000dead';

function errorCode(response: Response): string {
  return apiErrorSchema.parse(response.body).error.code;
}

type Client = {
  userId: string;
  get: (path: string) => request.Test;
  post: (path: string, body?: object) => request.Test;
  put: (path: string, body: object) => request.Test;
  delete: (path: string) => request.Test;
};

/** Registers a user and returns helpers that send that user's bearer token. */
async function signUp(app: TestApp['app'], email: string): Promise<Client> {
  const response = await request(app)
    .post('/v1/auth/register')
    .set('X-Token-Transport', 'body')
    .send({ email, password: 'synthetic-passphrase-1' });
  const { user, tokens } = authResponseSchema.parse(response.body);
  const bearer = `Bearer ${tokens?.accessToken ?? ''}`;

  return {
    userId: user.id,
    get: (path) => request(app).get(path).set('Authorization', bearer),
    post: (path, body = {}) => request(app).post(path).set('Authorization', bearer).send(body),
    put: (path, body) => request(app).put(path).set('Authorization', bearer).send(body),
    delete: (path) => request(app).delete(path).set('Authorization', bearer),
  };
}

async function createVisit(client: Client, title: string, consentGiven = true): Promise<string> {
  const response = await client.post('/v1/visits', { title, consentGiven });
  return visitResponseSchema.parse(response.body).visit.id;
}

describe('authentication on visit routes', () => {
  it.each([
    ['post', '/v1/visits'],
    ['get', '/v1/visits'],
    ['get', `/v1/visits/${UNKNOWN_ID}`],
    ['put', `/v1/visits/${UNKNOWN_ID}/note`],
    ['delete', `/v1/visits/${UNKNOWN_ID}`],
    ['delete', '/v1/account'],
  ] as const)('rejects %s %s without credentials', async (method, path) => {
    const { app } = createTestApp();

    const response = await request(app)[method](path);

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });
});

describe('POST /v1/visits', () => {
  it('creates a draft, stamps consent with the server clock, and records it', async () => {
    const { app, clock, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');

    const response = await alice.post('/v1/visits', {
      title: '  Cough review  ',
      consentGiven: true,
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { visit } = visitResponseSchema.parse(response.body);
    expect(visit).toMatchObject({
      title: 'Cough review',
      status: 'DRAFT',
      consentAt: clock.now().toISOString(),
      durationSec: null,
    });
    expect(repositories.audit.events.at(-1)).toEqual({
      actorId: alice.userId,
      action: 'VISIT_CREATED',
      resourceType: 'VISIT',
      resourceId: visit.id,
    });
  });

  it('leaves consent empty unless it was given', async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');

    const response = await alice.post('/v1/visits', { title: 'Cough review' });

    expect(visitResponseSchema.parse(response.body).visit.consentAt).toBeNull();
  });

  it.each([
    ['an empty title', { title: '   ' }],
    ['a title over 200 characters', { title: 'x'.repeat(201) }],
    ['a missing title', {}],
    ['a non-boolean consent flag', { title: 'Cough review', consentGiven: 'yes' }],
  ])('rejects %s', async (_label, body) => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');

    const response = await alice.post('/v1/visits', body);

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });
});

describe('limits on creating visits', () => {
  it('caps the visits a guest may hold, and frees a slot when one is deleted', async () => {
    const { app } = createTestApp();
    const session = await request(app).post('/v1/auth/guest').set('X-Token-Transport', 'body');
    const bearer = `Bearer ${authResponseSchema.parse(session.body).tokens?.accessToken ?? ''}`;
    const create = () =>
      request(app).post('/v1/visits').set('Authorization', bearer).send({ title: 'Visit' });
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push(visitResponseSchema.parse((await create()).body).visit.id);
    }

    const overLimit = await create();
    await request(app)
      .delete(`/v1/visits/${String(ids[0])}`)
      .set('Authorization', bearer);
    const afterDelete = await create();

    expect(overLimit.status).toBe(409);
    expect(errorCode(overLimit)).toBe('VISIT_LIMIT_REACHED');
    expect(afterDelete.status).toBe(201);
  });

  it('gives a registered user a higher ceiling', async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');

    for (let i = 0; i < 21; i++) {
      expect((await alice.post('/v1/visits', { title: 'Visit' })).status).toBe(201);
    }
  });

  it('throttles a burst of writes from one account', async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');

    // One write was the create above; the note is then saved until the window's budget of 300 is spent.
    const statuses = new Set<number>();
    for (let i = 0; i < 299; i++) {
      statuses.add((await alice.put(`/v1/visits/${id}/note`, { note })).status);
    }
    const throttled = await alice.put(`/v1/visits/${id}/note`, { note });

    expect([...statuses]).toEqual([200]);
    expect(throttled.status).toBe(429);
    expect(errorCode(throttled)).toBe('RATE_LIMITED');
    expect((await alice.get(`/v1/visits/${id}`)).status).toBe(200);
  });

  it('turns away a token whose account no longer exists, instead of failing', async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    repositories.users.remove(alice.userId);

    const response = await alice.post('/v1/visits', { title: 'Cough review' });

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
    expect(repositories.visits.records).toHaveLength(0);
  });
});

describe('GET /v1/visits', () => {
  it("returns only the caller's visits, newest first, without clinical content", async () => {
    const { app, clock } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const first = await createVisit(alice, 'First');
    clock.advance(1000);
    await createVisit(bob, 'Not hers');
    clock.advance(1000);
    const second = await createVisit(alice, 'Second');
    await alice.put(`/v1/visits/${first}/note`, { note });

    const response = await alice.get('/v1/visits');

    expect(response.status).toBe(200);
    const { items, nextCursor } = listVisitsResponseSchema.parse(response.body);
    expect(items.map((item) => item.id)).toEqual([second, first]);
    expect(nextCursor).toBeNull();
    expect(response.text).not.toContain('note');
    expect(response.text).not.toContain('transcript');
    expect(response.text).not.toContain('Not hers');
  });

  it('searches titles case-insensitively and treats wildcards as plain text', async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const knee = await createVisit(alice, 'Knee pain follow-up');
    await createVisit(alice, 'Annual review');

    const match = await alice.get('/v1/visits?q=KNEE');
    const wildcard = await alice.get('/v1/visits?q=%25');

    expect(listVisitsResponseSchema.parse(match.body).items.map((item) => item.id)).toEqual([knee]);
    expect(listVisitsResponseSchema.parse(wildcard.body).items).toEqual([]);
  });

  it('pages through every visit exactly once, even when rows share a timestamp', async () => {
    const { app, clock } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      created.push(await createVisit(alice, `Visit ${String(i)}`));
      // Visits 1 and 2, and 3 and 4, are created in the same millisecond.
      if (i % 2 === 0) {
        clock.advance(1000);
      }
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response: Response = await alice.get(
        `/v1/visits?limit=2${cursor === null ? '' : `&cursor=${cursor}`}`,
      );
      const page = listVisitsResponseSchema.parse(response.body);
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor !== null && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(created));
  });

  it('keeps paging correctly after the row the cursor points at is deleted', async () => {
    const { app, clock } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(await createVisit(alice, `Visit ${String(i)}`));
      clock.advance(1000);
    }
    const firstPage = listVisitsResponseSchema.parse((await alice.get('/v1/visits?limit=2')).body);
    await alice.delete(`/v1/visits/${String(firstPage.items[1]?.id)}`);

    const secondPage = listVisitsResponseSchema.parse(
      (await alice.get(`/v1/visits?limit=2&cursor=${String(firstPage.nextCursor)}`)).body,
    );

    expect(secondPage.items.map((item) => item.id)).toEqual([ids[1], ids[0]]);
  });

  it.each([
    ['a cursor it did not issue', '/v1/visits?cursor=not-a-cursor'],
    ['a limit above the maximum', '/v1/visits?limit=51'],
    ['a limit of zero', '/v1/visits?limit=0'],
  ])('rejects %s', async (_label, path) => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');

    const response = await alice.get(path);

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/visits/:id', () => {
  it('returns the decrypted transcript and note to the owner and audits the view', async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');
    await alice.put(`/v1/visits/${id}/note`, { note });
    repositories.visits.patch(id, {
      status: 'READY',
      transcriptEnc: createFieldCipher(TEST_FIELD_ENCRYPTION_KEY).encrypt(
        JSON.stringify(transcript),
        `visit:${id}:transcript`,
      ),
    });

    const response = await alice.get(`/v1/visits/${id}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(visitDetailResponseSchema.parse(response.body).visit).toMatchObject({
      id,
      status: 'READY',
      note,
      transcript,
    });
    expect(repositories.audit.events.at(-1)).toEqual({
      actorId: alice.userId,
      action: 'VISIT_VIEWED',
      resourceType: 'VISIT',
      resourceId: id,
    });
  });

  it('returns nulls for a visit that has no transcript or note yet', async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');

    const response = await alice.get(`/v1/visits/${id}`);

    expect(visitDetailResponseSchema.parse(response.body).visit).toMatchObject({
      note: null,
      transcript: null,
    });
  });

  it("answers 404 for another user's visit, exactly as for one that does not exist", async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const id = await createVisit(alice, 'Cough review');
    await alice.put(`/v1/visits/${id}/note`, { note });
    const auditCount = repositories.audit.events.length;

    const others = await bob.get(`/v1/visits/${id}`);
    const missing = await bob.get(`/v1/visits/${UNKNOWN_ID}`);

    expect(others.status).toBe(404);
    expect(others.body).toEqual(missing.body);
    expect(others.text).not.toContain('cough');
    expect(repositories.audit.events).toHaveLength(auditCount);
  });

  it('rejects an id that is not a UUID', async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');

    const response = await alice.get('/v1/visits/not-a-uuid');

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });

  it("reports stored content of the wrong shape as a server fault, not as the caller's mistake", async () => {
    const { app, repositories, logs } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');
    repositories.visits.patch(id, {
      noteEnc: createFieldCipher(TEST_FIELD_ENCRYPTION_KEY).encrypt(
        JSON.stringify({ subjective: 'Synthetic-stored-text', objective: 42 }),
        `visit:${id}:note`,
      ),
    });

    const response = await alice.get(`/v1/visits/${id}`);

    expect(response.status).toBe(500);
    expect(errorCode(response)).toBe('INTERNAL_ERROR');
    expect(response.text).not.toContain('Synthetic-stored-text');
    expect(logs.raw()).not.toContain('Synthetic-stored-text');
  });

  it('fails closed when a stored note has been moved from another visit', async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const source = await createVisit(alice, 'Source');
    const target = await createVisit(alice, 'Target');
    await alice.put(`/v1/visits/${source}/note`, { note });
    const stolen = repositories.visits.records.find((record) => record.id === source)?.noteEnc;
    repositories.visits.patch(target, { noteEnc: stolen ?? null });

    const response = await alice.get(`/v1/visits/${target}`);

    expect(response.status).toBe(500);
    expect(errorCode(response)).toBe('INTERNAL_ERROR');
    expect(response.text).not.toContain('cough');
  });
});

describe('PUT /v1/visits/:id/note', () => {
  it('stores the note encrypted and records the edit', async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');

    const response = await alice.put(`/v1/visits/${id}/note`, { note });

    expect(response.status).toBe(200);
    expect(visitResponseSchema.parse(response.body).visit.id).toBe(id);
    expect(response.text).not.toContain('cough');

    const stored = repositories.visits.records.find((record) => record.id === id);
    expect(stored?.noteEnc).toMatch(/^v1\./);
    expect(JSON.stringify(repositories.visits.records)).not.toContain('cough');
    expect(repositories.audit.events.at(-1)).toMatchObject({
      action: 'VISIT_NOTE_UPDATED',
      resourceId: id,
    });
  });

  it('replaces the previous note, so a retried autosave is harmless', async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');
    const edited = { ...note, plan: 'Review in one week.' };

    await alice.put(`/v1/visits/${id}/note`, { note });
    await alice.put(`/v1/visits/${id}/note`, { note: edited });
    await alice.put(`/v1/visits/${id}/note`, { note: edited });

    const detail = visitDetailResponseSchema.parse((await alice.get(`/v1/visits/${id}`)).body);
    expect(detail.visit.note).toEqual(edited);
  });

  it("refuses to edit another user's visit and leaves it untouched", async () => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const id = await createVisit(alice, 'Cough review');
    await alice.put(`/v1/visits/${id}/note`, { note });

    const response = await bob.put(`/v1/visits/${id}/note`, {
      note: { ...note, plan: 'Overwritten by someone else.' },
    });

    expect(response.status).toBe(404);
    const detail = visitDetailResponseSchema.parse((await alice.get(`/v1/visits/${id}`)).body);
    expect(detail.visit.note).toEqual(note);
  });

  it('refuses an edit while the visit is being processed', async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');
    repositories.visits.patch(id, { status: 'PROCESSING' });

    const response = await alice.put(`/v1/visits/${id}/note`, { note });

    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('CONFLICT');
  });

  it.each([
    ['a missing section', { note: { subjective: 'a', objective: 'b', assessment: 'c' } }],
    ['a section over the length limit', { note: { ...note, plan: 'x'.repeat(10_001) } }],
    ['no note', {}],
  ])('rejects %s', async (_label, body) => {
    const { app } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');

    const response = await alice.put(`/v1/visits/${id}/note`, body);

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /v1/visits/:id', () => {
  it('deletes the visit, records it once, and stays 204 on a repeat', async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Cough review');

    const first = await alice.delete(`/v1/visits/${id}`);
    const second = await alice.delete(`/v1/visits/${id}`);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect((await alice.get(`/v1/visits/${id}`)).status).toBe(404);
    expect(
      repositories.audit.events.filter((event) => event.action === 'VISIT_DELETED'),
    ).toHaveLength(1);
  });

  it("does nothing to another user's visit", async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const id = await createVisit(alice, 'Cough review');

    const response = await bob.delete(`/v1/visits/${id}`);

    expect(response.status).toBe(204);
    expect((await alice.get(`/v1/visits/${id}`)).status).toBe(200);
    expect(
      repositories.audit.events.filter((event) => event.action === 'VISIT_DELETED'),
    ).toHaveLength(0);
  });
});

describe('DELETE /v1/account', () => {
  it("removes the account with its visits and sessions, and nobody else's", async () => {
    const { app, repositories } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const bob = await signUp(app, 'bob@example.com');
    await createVisit(alice, 'Cough review');
    const bobsVisit = await createVisit(bob, 'Knee pain');

    const response = await alice.delete('/v1/account');

    expect(response.status).toBe(204);
    expect(repositories.users.records.map((user) => user.id)).toEqual([bob.userId]);
    expect(repositories.visits.records.map((visit) => visit.id)).toEqual([bobsVisit]);
    expect(repositories.refreshTokens.records.every((token) => token.userId === bob.userId)).toBe(
      true,
    );
    expect((await alice.get('/v1/auth/me')).status).toBe(401);
    expect(repositories.audit.events.at(-1)).toEqual({
      actorId: alice.userId,
      action: 'ACCOUNT_DELETED',
      resourceType: 'USER',
      resourceId: alice.userId,
    });
  });

  it('clears the session cookies of a browser', async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);
    await agent
      .post('/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'synthetic-passphrase-1' });

    const response = await agent.delete('/v1/account').set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(204);
    const cleared = response.get('Set-Cookie') ?? [];
    expect(cleared.some((cookie) => cookie.startsWith('attune_access=;'))).toBe(true);
    expect(cleared.some((cookie) => cookie.startsWith('attune_refresh=;'))).toBe(true);
  });

  it('refuses a cookie-authenticated deletion sent from another site', async () => {
    const { app, repositories } = createTestApp();
    const agent = request.agent(app);
    await agent
      .post('/v1/auth/register')
      .send({ email: 'alice@example.com', password: 'synthetic-passphrase-1' });

    const response = await agent.delete('/v1/account').set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(403);
    expect(repositories.users.records).toHaveLength(1);
  });
});

describe('logging', () => {
  it('keeps titles, search terms and note text out of the logs', async () => {
    const { app, logs } = createTestApp();
    const alice = await signUp(app, 'alice@example.com');
    const id = await createVisit(alice, 'Synthetic-title-marker');
    await alice.put(`/v1/visits/${id}/note`, { note });
    await alice.get(`/v1/visits/${id}`);
    await alice.get('/v1/visits?q=Synthetic-search-marker');

    const output = logs.raw();
    expect(logs.entries().length).toBeGreaterThanOrEqual(5);
    for (const secret of ['Synthetic-title-marker', 'Synthetic-search-marker', 'cough', 'Fluids']) {
      expect(output).not.toContain(secret);
    }
  });
});
