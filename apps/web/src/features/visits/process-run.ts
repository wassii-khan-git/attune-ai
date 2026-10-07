import { MAX_AUDIO_BYTES, type ErrorCode, type ProcessEvent } from '@attune/shared';

import { isApiError, type ClientErrorCode } from '@/lib/api/errors';
import { AUDIO_FORMATS } from '@/lib/audio/audio-file';
import { formatBytes, formatWait } from '@/lib/format';

/** The stages a run goes through, in order. Creating the visit is part of the first. */
export type RunStep = 'uploading' | 'transcribing' | 'drafting';

export type RunFailure = {
  message: string;
  /** Whether sending the same recording again can succeed. */
  canRetry: boolean;
};

export type RunState =
  | { phase: 'idle' }
  | {
      phase: 'running';
      step: RunStep;
      /** Share of the recording sent so far, from 0 to 1. */
      uploadFraction: number;
      /** Number of speaker turns in the transcript, once it exists. */
      turns: number | null;
    }
  | { phase: 'done'; turns: number | null }
  | { phase: 'failed'; step: RunStep; failure: RunFailure };

export type RunAction =
  | { type: 'started' }
  | { type: 'upload-progress'; fraction: number }
  | { type: 'event'; event: ProcessEvent }
  /** The API says the visit already has its note: an earlier attempt finished after all. */
  | { type: 'finished-earlier' }
  | { type: 'failed'; failure: RunFailure }
  | { type: 'reset' };

export const IDLE: RunState = { phase: 'idle' };

export const RUN_STEPS: readonly RunStep[] = ['uploading', 'transcribing', 'drafting'];

export type StepStatus = 'waiting' | 'active' | 'complete' | 'failed';

/** Where one step stands, for the progress display. */
export function stepStatus(state: RunState, step: RunStep): StepStatus {
  if (state.phase === 'idle') {
    return 'waiting';
  }
  if (state.phase === 'done') {
    return 'complete';
  }
  const position = RUN_STEPS.indexOf(step) - RUN_STEPS.indexOf(state.step);
  if (position < 0) {
    return 'complete';
  }
  if (position > 0) {
    return 'waiting';
  }
  return state.phase === 'failed' ? 'failed' : 'active';
}

const GENERIC: RunFailure = { message: 'Something went wrong. Please try again.', canRetry: true };

const INTERRUPTED: RunFailure = {
  message:
    'The connection was lost before the note was finished. It may still be completing: try again in a moment.',
  canRetry: true,
};

function describe(
  code: ClientErrorCode,
  serverMessage: string,
  retryAfterSec?: number,
): RunFailure {
  switch (code) {
    case 'NETWORK_ERROR':
      return { message: serverMessage, canRetry: true };
    case 'RATE_LIMITED':
      return {
        message: `Too many requests. Try again in ${formatWait(retryAfterSec)}.`,
        canRetry: true,
      };
    case 'AI_UNAVAILABLE':
      return {
        message:
          'The AI service could not process this recording just now. Your recording is still here, so you can try again.',
        canRetry: true,
      };
    case 'CONFLICT':
      return {
        message:
          'This recording is still being processed from the earlier attempt. Wait a moment, then try again.',
        canRetry: true,
      };
    // The API words these two for the user, including the limit that applies to this account.
    case 'QUOTA_EXCEEDED':
    case 'VISIT_LIMIT_REACHED':
      return { message: serverMessage, canRetry: false };
    case 'NO_SPEECH_DETECTED':
      return {
        message:
          'No speech was found in this recording. Check the microphone, or choose different audio.',
        canRetry: false,
      };
    case 'PAYLOAD_TOO_LARGE':
      return {
        message: `This recording is too large to upload. The limit is ${formatBytes(MAX_AUDIO_BYTES)}.`,
        canRetry: false,
      };
    case 'UNSUPPORTED_MEDIA_TYPE':
      return {
        message: `This file is not a supported audio recording. Use ${AUDIO_FORMATS}.`,
        canRetry: false,
      };
    case 'UNAUTHENTICATED':
      return { message: 'Your session has ended. Sign in again to continue.', canRetry: false };
    case 'NOT_FOUND':
      return { message: 'This visit no longer exists. Go back and start again.', canRetry: false };
    default:
      return GENERIC;
  }
}

/**
 * Turns a refused or broken run into a sentence for the page, and says
 * whether trying again with the same recording makes sense.
 *
 * `streamStarted` is true once the API had begun answering. A connection lost
 * after that point is a different situation from never reaching the server:
 * the run carries on without the browser and may still save its note.
 */
export function describeRunError(error: unknown, streamStarted: boolean): RunFailure {
  if (!isApiError(error)) {
    return GENERIC;
  }
  if (error.code === 'NETWORK_ERROR' && streamStarted) {
    return INTERRUPTED;
  }
  return describe(error.code, error.message, error.retryAfterSec);
}

/** The response ended without saying how the run went. */
export function describeInterruption(): RunFailure {
  return INTERRUPTED;
}

function describeEventError(error: { code: ErrorCode; message: string }): RunFailure {
  return describe(error.code, error.message);
}

function clamp(fraction: number): number {
  return Math.min(Math.max(fraction, 0), 1);
}

/**
 * Follows one run from the first click to its result. Everything the progress
 * display shows is derived from this state.
 *
 * Progress and events only count while a run is in flight, so a late callback
 * from a cancelled request cannot bring a finished or reset run back to life.
 */
export function reduceRun(state: RunState, action: RunAction): RunState {
  if (action.type === 'started') {
    return { phase: 'running', step: 'uploading', uploadFraction: 0, turns: null };
  }
  if (action.type === 'reset') {
    return IDLE;
  }
  if (state.phase !== 'running') {
    return state;
  }

  switch (action.type) {
    case 'upload-progress':
      return state.step === 'uploading'
        ? { ...state, uploadFraction: clamp(action.fraction) }
        : state;
    case 'finished-earlier':
      return { phase: 'done', turns: null };
    case 'failed':
      return { phase: 'failed', step: state.step, failure: action.failure };
    case 'event':
      break;
  }

  const { event } = action;
  switch (event.type) {
    case 'stage':
      return { ...state, step: event.stage, uploadFraction: 1 };
    case 'transcript':
      return { ...state, turns: event.transcript.length };
    case 'note':
      // The draft itself is shown on the visit's own page, not in the progress display.
      return state;
    case 'done':
      return { phase: 'done', turns: event.visit.transcript?.length ?? state.turns };
    case 'error':
      return { phase: 'failed', step: state.step, failure: describeEventError(event.error) };
  }
}
