import type { ProcessEvent, VisitDetail } from '@attune/shared';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/errors';

import {
  describeInterruption,
  describeRunError,
  IDLE,
  reduceRun,
  RUN_STEPS,
  stepStatus,
  transcribedTurns,
  visitPageFor,
  type RunAction,
  type RunState,
} from './process-run';

const VISIT_ID = '2f1c7c1e-6a54-4b6f-9d1e-0c9f5a3b7e21';
const TITLE = 'Sore throat and cough';

const visit: VisitDetail = {
  id: VISIT_ID,
  title: TITLE,
  status: 'READY',
  consentAt: '2026-10-07T12:00:00.000Z',
  durationSec: 38,
  createdAt: '2026-10-07T12:00:00.000Z',
  updatedAt: '2026-10-07T12:01:00.000Z',
  transcript: [
    { speaker: 'Clinician', text: 'Good morning.' },
    { speaker: 'Patient', text: 'Hello.' },
  ],
  note: { subjective: 'a', objective: 'b', assessment: 'c', plan: 'd' },
};

const started: RunAction = { type: 'started', title: TITLE, visitId: null };
const created: RunAction = { type: 'visit-created', visitId: VISIT_ID };
const event = (value: ProcessEvent): RunAction => ({ type: 'event', event: value });

function play(...actions: RunAction[]): RunState {
  return actions.reduce(reduceRun, IDLE);
}

describe('reduceRun', () => {
  it('starts by uploading, at zero, before the visit exists', () => {
    expect(play(started)).toEqual({
      phase: 'running',
      step: 'uploading',
      uploadFraction: 0,
      transcript: null,
      note: {},
      visitId: null,
      title: TITLE,
    });
  });

  it('learns which visit the run is for once it has been created', () => {
    expect(play(started, created)).toMatchObject({ phase: 'running', visitId: VISIT_ID });
  });

  it('keeps the visit when the same recording is sent again', () => {
    const retried = play(
      started,
      created,
      { type: 'failed', failure: describeInterruption() },
      {
        type: 'started',
        title: TITLE,
        visitId: VISIT_ID,
      },
    );

    expect(retried).toMatchObject({ phase: 'running', step: 'uploading', visitId: VISIT_ID });
  });

  it('follows the upload, keeping the share between 0 and 1', () => {
    const at = (fraction: number) => play(started, { type: 'upload-progress', fraction });

    expect(at(0.4)).toMatchObject({ step: 'uploading', uploadFraction: 0.4 });
    expect(at(1.7)).toMatchObject({ uploadFraction: 1 });
    expect(at(-1)).toMatchObject({ uploadFraction: 0 });
  });

  it('collects the transcript and the growing note, then ends with the finished visit', () => {
    const transcribing = play(
      started,
      created,
      { type: 'upload-progress', fraction: 0.9 },
      event({ type: 'stage', stage: 'transcribing' }),
    );
    expect(transcribing).toMatchObject({
      step: 'transcribing',
      uploadFraction: 1,
      transcript: null,
    });

    const drafting = [
      event({ type: 'transcript', transcript: visit.transcript ?? [] }),
      event({ type: 'stage', stage: 'drafting' }),
      event({ type: 'note', note: { subjective: 'Sore' } }),
      event({ type: 'note', note: { subjective: 'Sore throat.', objective: 'Red' } }),
    ].reduce(reduceRun, transcribing);
    expect(drafting).toMatchObject({
      phase: 'running',
      step: 'drafting',
      transcript: visit.transcript,
      // Each snapshot replaces the one before it.
      note: { subjective: 'Sore throat.', objective: 'Red' },
    });

    expect(reduceRun(drafting, event({ type: 'done', visit }))).toEqual({
      phase: 'done',
      visitId: VISIT_ID,
      visit,
    });
  });

  it('ignores upload progress that arrives after the upload step', () => {
    const state = play(started, event({ type: 'stage', stage: 'transcribing' }), {
      type: 'upload-progress',
      fraction: 0.2,
    });

    expect(state).toMatchObject({ step: 'transcribing', uploadFraction: 1 });
  });

  it('records the step a run failed at, and keeps nothing of the partial result', () => {
    const state = play(
      started,
      created,
      event({ type: 'stage', stage: 'transcribing' }),
      event({ type: 'error', error: { code: 'NO_SPEECH_DETECTED', message: 'No speech.' } }),
    );

    expect(state).toEqual({
      phase: 'failed',
      step: 'transcribing',
      visitId: VISIT_ID,
      title: TITLE,
      failure: {
        message:
          'No speech was found in this recording. Check the microphone, or choose different audio.',
        canRetry: false,
      },
    });
  });

  it('keeps the visit and offers a retry when the AI service is busy, in words of its own', () => {
    const fromProvider = 'AI_APICallError: This model is currently experiencing high demand (503)';
    const state = play(
      started,
      created,
      event({ type: 'stage', stage: 'transcribing' }),
      event({ type: 'error', error: { code: 'AI_UNAVAILABLE', message: fromProvider } }),
    );

    expect(state).toEqual({
      phase: 'failed',
      step: 'transcribing',
      visitId: VISIT_ID,
      title: TITLE,
      failure: {
        message:
          'The AI service is busy right now. Please try again in a minute. Your recording is still here.',
        canRetry: true,
      },
    });
  });

  it('records a failure that was thrown, such as a refusal', () => {
    const failure = { message: 'Limit reached.', canRetry: false };

    expect(play(started, { type: 'failed', failure })).toEqual({
      phase: 'failed',
      step: 'uploading',
      visitId: null,
      title: TITLE,
      failure,
    });
  });

  it('treats a visit that already has its note as done, with the visit still to be loaded', () => {
    expect(play(started, created, { type: 'finished-earlier' })).toEqual({
      phase: 'done',
      visitId: VISIT_ID,
      visit: null,
    });
  });

  it('ignores late events once a run has been reset, failed or finished', () => {
    const late = event({ type: 'stage', stage: 'drafting' });
    const failed = play(started, { type: 'failed', failure: describeInterruption() });
    const done = play(started, event({ type: 'done', visit }));

    expect(play(started, { type: 'reset' }, late)).toEqual(IDLE);
    expect(reduceRun(failed, late)).toBe(failed);
    expect(reduceRun(done, { type: 'upload-progress', fraction: 0.5 })).toBe(done);
  });
});

describe('stepStatus', () => {
  const statuses = (state: RunState) => RUN_STEPS.map((step) => stepStatus(state, step));

  it('marks the steps before the current one complete and those after it waiting', () => {
    const transcribing = play(started, event({ type: 'stage', stage: 'transcribing' }));

    expect(statuses(play(started))).toEqual(['active', 'waiting', 'waiting']);
    expect(statuses(transcribing)).toEqual(['complete', 'active', 'waiting']);
  });

  it('marks the step a run failed at', () => {
    const failed = play(started, event({ type: 'stage', stage: 'transcribing' }), {
      type: 'failed',
      failure: describeInterruption(),
    });

    expect(statuses(failed)).toEqual(['complete', 'failed', 'waiting']);
  });

  it('marks every step complete when the run is done, and none before it starts', () => {
    expect(statuses(play(started, event({ type: 'done', visit })))).toEqual([
      'complete',
      'complete',
      'complete',
    ]);
    expect(statuses(IDLE)).toEqual(['waiting', 'waiting', 'waiting']);
  });
});

describe('transcribedTurns', () => {
  it('counts the turns once the transcript exists', () => {
    const transcribed = play(
      started,
      event({ type: 'transcript', transcript: visit.transcript ?? [] }),
    );

    expect(transcribedTurns(play(started))).toBeNull();
    expect(transcribedTurns(transcribed)).toBe(2);
    expect(transcribedTurns(reduceRun(transcribed, event({ type: 'done', visit })))).toBe(2);
  });
});

describe('visitPageFor', () => {
  const page = `/visits/${VISIT_ID}`;

  it('keeps the form on screen while the recording uploads', () => {
    expect(visitPageFor(IDLE)).toBeNull();
    expect(visitPageFor(play(started, created))).toBeNull();
  });

  it("moves to the visit's page once the API starts answering, and when the run is done", () => {
    const transcribing = play(started, created, event({ type: 'stage', stage: 'transcribing' }));

    expect(visitPageFor(transcribing)).toBe(page);
    expect(visitPageFor(reduceRun(transcribing, event({ type: 'done', visit })))).toBe(page);
    expect(visitPageFor(play(started, created, { type: 'finished-earlier' }))).toBe(page);
  });

  it('stays on the form when the run has failed', () => {
    const failed = play(started, created, { type: 'failed', failure: describeInterruption() });

    expect(visitPageFor(failed)).toBeNull();
  });
});

describe('describeRunError', () => {
  const refusal = (status: number, code: ApiError['code'], message = 'From the API.') =>
    new ApiError(status, code, message);

  it('shows the API wording for the daily limit, and does not offer a retry', () => {
    const message = 'You have reached the limit of 3 generations for today.';

    expect(describeRunError(refusal(429, 'QUOTA_EXCEEDED', message), false)).toEqual({
      message,
      canRetry: false,
    });
  });

  it('says how long to wait when requests are throttled', () => {
    const error = new ApiError(429, 'RATE_LIMITED', 'Too many requests.', [], 240);

    expect(describeRunError(error, false)).toEqual({
      message: 'Too many requests. Try again in 4 minutes.',
      canRetry: true,
    });
  });

  it('tells a lost connection apart from a server that was never reached', () => {
    const offline = refusal(0, 'NETWORK_ERROR', 'Could not reach the server.');

    expect(describeRunError(offline, false)).toEqual({
      message: 'Could not reach the server.',
      canRetry: true,
    });
    expect(describeRunError(offline, true)).toEqual(describeInterruption());
    expect(describeInterruption().message).toMatch(/may still be completing/);
  });

  it.each([
    ['AI_UNAVAILABLE', true],
    ['AI_FAILED', true],
    ['CONFLICT', true],
    ['INTERNAL_ERROR', true],
    ['INVALID_RESPONSE', true],
    ['NO_SPEECH_DETECTED', false],
    ['PAYLOAD_TOO_LARGE', false],
    ['UNSUPPORTED_MEDIA_TYPE', false],
    ['VISIT_LIMIT_REACHED', false],
    ['UNAUTHENTICATED', false],
    ['NOT_FOUND', false],
  ] as const)('offers a retry for %s: %s', (code, canRetry) => {
    expect(describeRunError(refusal(400, code), false).canRetry).toBe(canRetry);
  });

  it.each(['AI_UNAVAILABLE', 'AI_FAILED', 'INTERNAL_ERROR', 'INVALID_RESPONSE'] as const)(
    'never repeats a technical message that arrives with %s',
    (code) => {
      const technical = 'RESOURCE_EXHAUSTED: quota exceeded for generativelanguage (HTTP 429)';

      for (const streamStarted of [false, true]) {
        const { message } = describeRunError(refusal(503, code, technical), streamStarted);

        expect(message).not.toMatch(/RESOURCE_EXHAUSTED|quota|429|generativelanguage/);
      }
    },
  );

  it('says the same thing whether the busy service refused the upload or failed mid-run', () => {
    const busy = 'The AI service is busy right now. Please try again in a minute.';

    expect(describeRunError(refusal(503, 'AI_UNAVAILABLE'), false).message).toContain(busy);
    expect(describeRunError(refusal(503, 'AI_UNAVAILABLE'), true).message).toContain(busy);
  });

  it('never shows the text of an unexpected error', () => {
    expect(describeRunError(new TypeError('secret detail'), false)).toEqual({
      message: 'Something went wrong. Please try again.',
      canRetry: true,
    });
  });
});
