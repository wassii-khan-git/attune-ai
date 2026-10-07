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
  type RunAction,
  type RunState,
} from './process-run';

const visit: VisitDetail = {
  id: '2f1c7c1e-6a54-4b6f-9d1e-0c9f5a3b7e21',
  title: 'Sore throat and cough',
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

const event = (value: ProcessEvent): RunAction => ({ type: 'event', event: value });

function play(...actions: RunAction[]): RunState {
  return actions.reduce(reduceRun, IDLE);
}

describe('reduceRun', () => {
  it('starts by uploading, at zero', () => {
    expect(play({ type: 'started' })).toEqual({
      phase: 'running',
      step: 'uploading',
      uploadFraction: 0,
      turns: null,
    });
  });

  it('follows the upload, keeping the share between 0 and 1', () => {
    const at = (fraction: number) =>
      play({ type: 'started' }, { type: 'upload-progress', fraction });

    expect(at(0.4)).toMatchObject({ step: 'uploading', uploadFraction: 0.4 });
    expect(at(1.7)).toMatchObject({ uploadFraction: 1 });
    expect(at(-1)).toMatchObject({ uploadFraction: 0 });
  });

  it('moves through transcribing and drafting to done', () => {
    const transcribing = play(
      { type: 'started' },
      { type: 'upload-progress', fraction: 0.9 },
      event({ type: 'stage', stage: 'transcribing' }),
    );
    expect(transcribing).toMatchObject({ step: 'transcribing', uploadFraction: 1, turns: null });

    const drafting = [
      event({ type: 'transcript', transcript: visit.transcript ?? [] }),
      event({ type: 'stage', stage: 'drafting' }),
      event({ type: 'note', note: { subjective: 'Sore throat.' } }),
    ].reduce(reduceRun, transcribing);
    expect(drafting).toMatchObject({ phase: 'running', step: 'drafting', turns: 2 });

    expect(reduceRun(drafting, event({ type: 'done', visit }))).toEqual({
      phase: 'done',
      turns: 2,
    });
  });

  it('ignores upload progress that arrives after the upload step', () => {
    const state = play({ type: 'started' }, event({ type: 'stage', stage: 'transcribing' }), {
      type: 'upload-progress',
      fraction: 0.2,
    });

    expect(state).toMatchObject({ step: 'transcribing', uploadFraction: 1 });
  });

  it('records the step a run failed at, from an error event', () => {
    const state = play(
      { type: 'started' },
      event({ type: 'stage', stage: 'transcribing' }),
      event({ type: 'error', error: { code: 'NO_SPEECH_DETECTED', message: 'No speech.' } }),
    );

    expect(state).toMatchObject({ phase: 'failed', step: 'transcribing' });
    expect(state.phase === 'failed' ? state.failure : null).toEqual({
      message:
        'No speech was found in this recording. Check the microphone, or choose different audio.',
      canRetry: false,
    });
  });

  it('records a failure that was thrown, such as a refusal', () => {
    const failure = { message: 'Limit reached.', canRetry: false };

    expect(play({ type: 'started' }, { type: 'failed', failure })).toEqual({
      phase: 'failed',
      step: 'uploading',
      failure,
    });
  });

  it('treats a visit that already has its note as done', () => {
    expect(play({ type: 'started' }, { type: 'finished-earlier' })).toEqual({
      phase: 'done',
      turns: null,
    });
  });

  it('ignores late events once a run has been reset, failed or finished', () => {
    const late = event({ type: 'stage', stage: 'drafting' });
    const failed = play({ type: 'started' }, { type: 'failed', failure: describeInterruption() });
    const done = play({ type: 'started' }, event({ type: 'done', visit }));

    expect(play({ type: 'started' }, { type: 'reset' }, late)).toEqual(IDLE);
    expect(reduceRun(failed, late)).toBe(failed);
    expect(reduceRun(done, { type: 'upload-progress', fraction: 0.5 })).toBe(done);
  });

  it('starts over from any state', () => {
    const failed = play({ type: 'started' }, { type: 'failed', failure: describeInterruption() });

    expect(reduceRun(failed, { type: 'started' })).toMatchObject({
      phase: 'running',
      step: 'uploading',
    });
  });
});

describe('stepStatus', () => {
  const statuses = (state: RunState) => RUN_STEPS.map((step) => stepStatus(state, step));

  it('marks the steps before the current one complete and those after it waiting', () => {
    const transcribing = play({ type: 'started' }, event({ type: 'stage', stage: 'transcribing' }));

    expect(statuses(play({ type: 'started' }))).toEqual(['active', 'waiting', 'waiting']);
    expect(statuses(transcribing)).toEqual(['complete', 'active', 'waiting']);
  });

  it('marks the step a run failed at', () => {
    const failed = play({ type: 'started' }, event({ type: 'stage', stage: 'transcribing' }), {
      type: 'failed',
      failure: describeInterruption(),
    });

    expect(statuses(failed)).toEqual(['complete', 'failed', 'waiting']);
  });

  it('marks every step complete when the run is done, and none before it starts', () => {
    expect(statuses(play({ type: 'started' }, { type: 'finished-earlier' }))).toEqual([
      'complete',
      'complete',
      'complete',
    ]);
    expect(statuses(IDLE)).toEqual(['waiting', 'waiting', 'waiting']);
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

  it('never shows the text of an unexpected error', () => {
    expect(describeRunError(new TypeError('secret detail'), false)).toEqual({
      message: 'Something went wrong. Please try again.',
      canRetry: true,
    });
  });
});
