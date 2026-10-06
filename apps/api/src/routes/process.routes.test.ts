import {
  apiErrorSchema,
  authResponseSchema,
  processEventSchema,
  visitDetailResponseSchema,
  visitResponseSchema,
  type ProcessEvent,
} from '@attune/shared';
import request, { type Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { ScribeModelError } from '../ai/scribe-model.js';
import {
  createFakeScribeModel,
  FAKE_NOTE,
  FAKE_TRANSCRIPT,
  type FakeScribeModelScript,
} from '../testing/fake-scribe-model.js';
import { createTestApp, type TestApp } from '../testing/test-app.js';

const MINUTE = 60 * 1000;

/** The smallest thing that passes for a WAV file, followed by a marker to search storage and logs for. */
const AUDIO_MARKER = 'synthetic-audio-payload-marker';
const WAV = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WAVEfmt '),
  Buffer.from(AUDIO_MARKER),
]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const retryable = () => new ScribeModelError('provider overloaded', true);
const permanent = () => new ScribeModelError('request rejected', false);

function setup(script: FakeScribeModelScript = {}) {
  const model = createFakeScribeModel(script);
  return { model, ...createTestApp({ scribeModel: model }) };
}

type Client = { userId: string; bearer: string };

async function signUp(app: TestApp['app'], email = 'alice@example.com'): Promise<Client> {
  const response = await request(app)
    .post('/v1/auth/register')
    .set('X-Token-Transport', 'body')
    .send({ email, password: 'synthetic-passphrase-1' });
  const { user, tokens } = authResponseSchema.parse(response.body);
  return { userId: user.id, bearer: `Bearer ${tokens?.accessToken ?? ''}` };
}

/** A fresh session for an existing account, for tests that move the clock past the token lifetime. */
async function signIn(app: TestApp['app'], email = 'alice@example.com'): Promise<Client> {
  const response = await request(app)
    .post('/v1/auth/login')
    .set('X-Token-Transport', 'body')
    .send({ email, password: 'synthetic-passphrase-1' });
  const { user, tokens } = authResponseSchema.parse(response.body);
  return { userId: user.id, bearer: `Bearer ${tokens?.accessToken ?? ''}` };
}

async function signUpGuest(app: TestApp['app']): Promise<Client> {
  const response = await request(app).post('/v1/auth/guest').set('X-Token-Transport', 'body');
  const { user, tokens } = authResponseSchema.parse(response.body);
  return { userId: user.id, bearer: `Bearer ${tokens?.accessToken ?? ''}` };
}

async function createVisit(app: TestApp['app'], client: Client, consentGiven = true) {
  const response = await request(app)
    .post('/v1/visits')
    .set('Authorization', client.bearer)
    .send({ title: 'Sore throat', consentGiven });
  return visitResponseSchema.parse(response.body).visit.id;
}

type UploadOptions = {
  file?: Buffer | null;
  contentType?: string;
  durationSec?: string;
};

/** Uploads a recording and returns the raw response; the body is kept as text for NDJSON parsing. */
function upload(
  app: TestApp['app'],
  client: Client | null,
  visitId: string,
  { file = WAV, contentType = 'audio/wav', durationSec }: UploadOptions = {},
) {
  let call = request(app)
    .post(`/v1/visits/${visitId}/process`)
    .buffer(true)
    .parse((res, done) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => {
        done(null, text);
      });
    });
  if (client !== null) {
    call = call.set('Authorization', client.bearer);
  }
  if (durationSec !== undefined) {
    call = call.field('durationSec', durationSec);
  }
  if (file !== null) {
    call = call.attach('audio', file, { filename: 'visit.wav', contentType });
  }
  return call;
}

function events(response: Response): ProcessEvent[] {
  return String(response.body)
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => processEventSchema.parse(JSON.parse(line)));
}

function errorCode(response: Response): string {
  return apiErrorSchema.parse(JSON.parse(String(response.body))).error.code;
}

function lastEvent(response: Response): ProcessEvent | undefined {
  return events(response).at(-1);
}

async function getVisit(app: TestApp['app'], client: Client, id: string) {
  const response = await request(app).get(`/v1/visits/${id}`).set('Authorization', client.bearer);
  return visitDetailResponseSchema.parse(response.body).visit;
}

describe('POST /v1/visits/:id/process', () => {
  it('streams the stages, the transcript and the growing note, then the finished visit', async () => {
    const { app, model } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id, { durationSec: '42' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/x-ndjson; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(events(response)).toEqual([
      { type: 'stage', stage: 'transcribing' },
      { type: 'transcript', transcript: FAKE_TRANSCRIPT },
      { type: 'stage', stage: 'drafting' },
      { type: 'note', note: { subjective: FAKE_NOTE.subjective } },
      { type: 'note', note: { subjective: FAKE_NOTE.subjective, objective: FAKE_NOTE.objective } },
      {
        type: 'done',
        visit: expect.objectContaining({
          id,
          status: 'READY',
          durationSec: 42,
          transcript: FAKE_TRANSCRIPT,
          note: FAKE_NOTE,
        }) as unknown,
      },
    ]);
    expect(model.transcribeCalls).toHaveLength(1);
    expect(model.draftCalls).toEqual([FAKE_TRANSCRIPT]);
  });

  it('passes the model the format found in the bytes, not the one the client declared', async () => {
    const { app, model } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    await upload(app, alice, id, { contentType: 'audio/mpeg' });

    expect(model.transcribeCalls[0]?.mediaType).toBe('audio/wav');
  });

  it('stores the result encrypted, makes it readable by the owner, and records the run', async () => {
    const { app, repositories } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    await upload(app, alice, id);

    const stored = repositories.visits.records.find((record) => record.id === id);
    expect(stored).toMatchObject({ status: 'READY' });
    expect(stored?.transcriptEnc).toMatch(/^v1\./);
    expect(stored?.noteEnc).toMatch(/^v1\./);
    expect(JSON.stringify(repositories.visits.records)).not.toContain('sore throat');

    expect(await getVisit(app, alice, id)).toMatchObject({
      status: 'READY',
      transcript: FAKE_TRANSCRIPT,
      note: FAKE_NOTE,
    });
    expect(repositories.audit.events).toContainEqual({
      actorId: alice.userId,
      action: 'VISIT_PROCESSED',
      resourceType: 'VISIT',
      resourceId: id,
    });
    expect(repositories.usage.totalFor(alice.userId)).toBe(1);
  });

  it('keeps the audio, the transcript and the note out of storage and logs', async () => {
    const { app, repositories, logs } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    await upload(app, alice, id);

    const everythingStored = JSON.stringify(repositories);
    const everythingLogged = logs.raw();
    for (const secret of [AUDIO_MARKER, 'sore throat', 'Rest and fluids']) {
      expect(everythingStored).not.toContain(secret);
      expect(everythingLogged).not.toContain(secret);
    }
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({
        msg: 'visit processed',
        visitId: id,
        turns: FAKE_TRANSCRIPT.length,
        transcriptionPrompt: 'transcribe-v1',
        notePrompt: 'note-v1',
      }),
    );
  });
});

describe('refusals before anything is streamed', () => {
  it('requires a signed-in caller', async () => {
    const { app } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, null, id);

    expect(response.status).toBe(401);
    expect(errorCode(response)).toBe('UNAUTHENTICATED');
  });

  it("answers 404 for another user's visit and never calls the model", async () => {
    const { app, model } = setup();
    const alice = await signUp(app);
    const bob = await signUp(app, 'bob@example.com');
    const id = await createVisit(app, alice);

    const response = await upload(app, bob, id);

    expect(response.status).toBe(404);
    expect(model.transcribeCalls).toHaveLength(0);
    expect((await getVisit(app, alice, id)).status).toBe('DRAFT');
  });

  it('refuses a visit without recorded consent and never calls the model', async () => {
    const { app, model, repositories } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice, false);

    const response = await upload(app, alice, id);

    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('CONSENT_REQUIRED');
    expect(model.transcribeCalls).toHaveLength(0);
    expect(repositories.usage.totalFor(alice.userId)).toBe(0);
  });

  it('rejects a request with no file', async () => {
    const { app } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id, { file: null, durationSec: '10' });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });

  it('rejects a file that is declared as something other than audio', async () => {
    const { app } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id, { file: PNG, contentType: 'image/png' });

    expect(response.status).toBe(415);
    expect(errorCode(response)).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a file that claims to be audio but is not', async () => {
    const { app, model } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id, { file: PNG, contentType: 'audio/wav' });

    expect(response.status).toBe(415);
    expect(errorCode(response)).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(model.transcribeCalls).toHaveLength(0);
  });

  it('rejects a recording over 4 MB', async () => {
    const { app, model } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);
    const tooLarge = Buffer.concat([WAV, Buffer.alloc(4 * 1024 * 1024)]);

    const response = await upload(app, alice, id, { file: tooLarge });

    expect(response.status).toBe(413);
    expect(errorCode(response)).toBe('PAYLOAD_TOO_LARGE');
    expect(model.transcribeCalls).toHaveLength(0);
  });

  it.each([['0'], ['301'], ['abc']])('rejects a duration of %s seconds', async (durationSec) => {
    const { app } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id, { durationSec });

    expect(response.status).toBe(400);
    expect(errorCode(response)).toBe('VALIDATION_ERROR');
  });

  it('refuses a second run while one is in flight, then accepts one after it ends', async () => {
    let overlapping: Response | undefined;
    const context = setup({
      onTranscribe: async () => {
        overlapping ??= await upload(context.app, alice, id);
      },
    });
    const alice = await signUp(context.app);
    const id = await createVisit(context.app, alice);

    const first = await upload(context.app, alice, id);
    const afterwards = await upload(context.app, alice, id);

    expect(overlapping?.status).toBe(409);
    expect(lastEvent(first)?.type).toBe('done');
    expect(lastEvent(afterwards)?.type).toBe('done');
  });

  it('takes over a run that has been stuck for more than five minutes', async () => {
    const { app, repositories, clock } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);
    repositories.visits.patch(id, { status: 'PROCESSING', updatedAt: clock.now() });

    clock.advance(4 * MINUTE);
    const tooSoon = await upload(app, alice, id);
    clock.advance(2 * MINUTE);
    const takeover = await upload(app, alice, id);

    expect(tooSoon.status).toBe(409);
    expect(lastEvent(takeover)?.type).toBe('done');
  });
});

describe('daily quota', () => {
  it('allows ten generations a day for a registered user, then refuses without locking the visit', async () => {
    const { app, model, clock } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    for (let i = 0; i < 10; i++) {
      expect(lastEvent(await upload(app, alice, id))?.type).toBe('done');
    }
    const refused = await upload(app, alice, id);

    expect(refused.status).toBe(429);
    expect(errorCode(refused)).toBe('QUOTA_EXCEEDED');
    expect(model.transcribeCalls).toHaveLength(10);
    expect((await getVisit(app, alice, id)).status).toBe('READY');

    clock.advance(24 * 60 * MINUTE);
    expect(lastEvent(await upload(app, await signIn(app), id))?.type).toBe('done');
  });

  it('allows a guest three', async () => {
    const { app } = setup();
    const guest = await signUpGuest(app);
    const id = await createVisit(app, guest);

    for (let i = 0; i < 3; i++) {
      expect(lastEvent(await upload(app, guest, id))?.type).toBe('done');
    }

    expect((await upload(app, guest, id)).status).toBe(429);
  });

  it('counts each user separately', async () => {
    const { app } = setup();
    const guest = await signUpGuest(app);
    const alice = await signUp(app);
    const guestVisit = await createVisit(app, guest);
    for (let i = 0; i < 4; i++) {
      await upload(app, guest, guestVisit);
    }

    const response = await upload(app, alice, await createVisit(app, alice));

    expect(lastEvent(response)?.type).toBe('done');
  });
});

describe('model failures', () => {
  it('retries a transient transcription failure once and succeeds', async () => {
    const { app, model } = setup({ transcribeFailures: [retryable()] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id);

    expect(lastEvent(response)?.type).toBe('done');
    expect(model.transcribeCalls).toHaveLength(2);
  });

  it('gives up after the second transient failure, reports it, and marks the visit failed', async () => {
    const { app, model, logs } = setup({ transcribeFailures: [retryable(), retryable()] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id);

    expect(response.status).toBe(200);
    expect(events(response)).toEqual([
      { type: 'stage', stage: 'transcribing' },
      {
        type: 'error',
        error: {
          code: 'AI_UNAVAILABLE',
          message: 'The AI service could not process this recording. Please try again.',
        },
      },
    ]);
    expect(model.transcribeCalls).toHaveLength(2);
    expect(await getVisit(app, alice, id)).toMatchObject({
      status: 'FAILED',
      transcript: null,
      note: null,
    });
    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ level: 'error', msg: 'visit processing failed', visitId: id }),
    );
  });

  it('does not retry a failure the provider marks as permanent', async () => {
    const { app, model } = setup({ transcribeFailures: [permanent()] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id);

    expect(lastEvent(response)).toMatchObject({ type: 'error', error: { code: 'AI_UNAVAILABLE' } });
    expect(model.transcribeCalls).toHaveLength(1);
  });

  it('restarts the note once when its stream breaks, and still finishes', async () => {
    const { app, model } = setup({ draftFailures: [retryable()] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id);

    expect(lastEvent(response)?.type).toBe('done');
    expect(model.draftCalls).toHaveLength(2);
    expect(model.transcribeCalls).toHaveLength(1);
  });

  it('keeps nothing when the note cannot be drafted', async () => {
    const { app } = setup({ draftFailures: [retryable(), retryable()] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id);

    expect(lastEvent(response)).toMatchObject({ type: 'error', error: { code: 'AI_UNAVAILABLE' } });
    expect(await getVisit(app, alice, id)).toMatchObject({
      status: 'FAILED',
      transcript: null,
      note: null,
    });
  });

  it('reports a recording with no speech instead of drafting an empty note', async () => {
    const { app, model } = setup({ transcript: [] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id);

    expect(lastEvent(response)).toMatchObject({
      type: 'error',
      error: { code: 'NO_SPEECH_DETECTED' },
    });
    expect(model.draftCalls).toHaveLength(0);
    expect((await getVisit(app, alice, id)).status).toBe('FAILED');
  });

  it('hides an unexpected error from the client', async () => {
    const { app } = setup({ transcribeFailures: [new Error('socket hang up at 10.0.0.7')] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);

    const response = await upload(app, alice, id);

    expect(lastEvent(response)).toEqual({
      type: 'error',
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
    expect(String(response.body)).not.toContain('10.0.0.7');
  });

  it('can be processed again after a failure', async () => {
    const { app } = setup({ transcribeFailures: [permanent()] });
    const alice = await signUp(app);
    const id = await createVisit(app, alice);
    await upload(app, alice, id);

    const response = await upload(app, alice, id);

    expect(lastEvent(response)?.type).toBe('done');
  });
});

describe('interaction with note editing', () => {
  it('lets the owner edit the generated note afterwards', async () => {
    const { app } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);
    await upload(app, alice, id);
    const edited = { ...FAKE_NOTE, assessment: 'Viral pharyngitis.' };

    const response = await request(app)
      .put(`/v1/visits/${id}/note`)
      .set('Authorization', alice.bearer)
      .send({ note: edited });

    expect(response.status).toBe(200);
    expect((await getVisit(app, alice, id)).note).toEqual(edited);
  });

  it('unblocks note editing once a stuck run is older than five minutes', async () => {
    const { app, repositories, clock } = setup();
    const alice = await signUp(app);
    const id = await createVisit(app, alice);
    repositories.visits.patch(id, { status: 'PROCESSING', updatedAt: clock.now() });
    const save = () =>
      request(app)
        .put(`/v1/visits/${id}/note`)
        .set('Authorization', alice.bearer)
        .send({ note: FAKE_NOTE });

    const during = await save();
    clock.advance(6 * MINUTE);
    const after = await save();

    expect(during.status).toBe(409);
    expect(after.status).toBe(200);
  });
});
