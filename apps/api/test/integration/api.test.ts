import {
  authResponseSchema,
  processEventSchema,
  visitDetailResponseSchema,
  visitResponseSchema,
} from '@attune/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/create-app.js';
import { createLogger } from '../../src/lib/logger.js';
import {
  createFakeScribeModel,
  FAKE_NOTE,
  FAKE_TRANSCRIPT,
} from '../../src/testing/fake-scribe-model.js';
import { connectTestDatabase, uniqueEmail } from './database.js';

const db = connectTestDatabase();
afterAll(db.cleanUp);

/** The real app on the real database. Only the language model is scripted. */
const app = createApp({
  logger: createLogger({ level: 'silent' }),
  repositories: db.repositories,
  readinessChecks: [],
  corsAllowedOrigins: ['https://app.example.com'],
  trustProxyHops: 0,
  accessTokenSecret: 'integration-test-access-token-secret-0123',
  cronSecret: 'integration-test-cron-secret-0123456789',
  fieldEncryptionKey: Buffer.alloc(32, 9),
  scribeModel: createFakeScribeModel(),
  secureCookies: false,
  dailyGenerationBudget: 1_000,
  passwordHashCost: 4,
});

const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]);

describe('the API against PostgreSQL', () => {
  it('takes a user from registration to a stored, encrypted note and then full deletion', async () => {
    const email = uniqueEmail();
    const registered = await request(app)
      .post('/v1/auth/register')
      .set('X-Token-Transport', 'body')
      .send({ email, password: 'synthetic-passphrase-1' });
    const { user, tokens } = authResponseSchema.parse(registered.body);
    db.track(user.id);
    const bearer = `Bearer ${tokens?.accessToken ?? ''}`;

    const created = await request(app)
      .post('/v1/visits')
      .set('Authorization', bearer)
      .send({ title: 'Sore throat', consentGiven: true });
    const visitId = visitResponseSchema.parse(created.body).visit.id;

    const processed = await request(app)
      .post(`/v1/visits/${visitId}/process`)
      .set('Authorization', bearer)
      .field('durationSec', '30')
      .attach('audio', WAV, { filename: 'visit.wav', contentType: 'audio/wav' })
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => {
          done(null, text);
        });
      });
    const events = String(processed.body)
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => processEventSchema.parse(JSON.parse(line)));
    expect(events.at(-1)?.type).toBe('done');

    // What reached the database is ciphertext, not the clinical text.
    const stored = await db.prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
    expect(stored.status).toBe('READY');
    expect(stored.noteEnc).toMatch(/^v1\./);
    expect(stored.transcriptEnc).toMatch(/^v1\./);
    expect(`${String(stored.noteEnc)}${String(stored.transcriptEnc)}`).not.toContain('sore throat');

    const fetched = await request(app).get(`/v1/visits/${visitId}`).set('Authorization', bearer);
    expect(visitDetailResponseSchema.parse(fetched.body).visit).toMatchObject({
      note: FAKE_NOTE,
      transcript: FAKE_TRANSCRIPT,
    });

    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: 'synthetic-passphrase-1' });
    expect(login.status).toBe(200);

    const deleted = await request(app).delete('/v1/account').set('Authorization', bearer);
    expect(deleted.status).toBe(204);
    expect(await db.prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await db.prisma.visit.count({ where: { id: visitId } })).toBe(0);
    expect(await db.prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);

    const actions = await db.prisma.auditEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(actions.map((event) => event.action)).toEqual([
      'USER_REGISTERED',
      'VISIT_CREATED',
      'VISIT_PROCESSED',
      'VISIT_VIEWED',
      'USER_LOGGED_IN',
      'ACCOUNT_DELETED',
    ]);
  });
});
