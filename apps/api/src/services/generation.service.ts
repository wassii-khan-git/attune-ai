import type { ErrorCode, ProcessEvent, ProcessStage, SoapNote } from '@attune/shared';

import { NOTE_PROMPT, TRANSCRIPTION_PROMPT } from '../ai/prompts.js';
import {
  ScribeModelError,
  type AudioInput,
  type ScribeFallbackModel,
  type ScribeModel,
} from '../ai/scribe-model.js';
import { AppError } from '../lib/app-error.js';
import type { FieldCipher } from '../lib/field-cipher.js';
import type { Logger } from '../lib/logger.js';
import { SafeError } from '../lib/safe-error.js';
import { streamWithOneRetry, withOneRetry, type RetryOptions } from '../lib/retry.js';
import type { UsageRepository } from '../repositories/usage.repository.js';
import type { VisitRepository } from '../repositories/visit.repository.js';
import type { AuditService } from './audit.service.js';
import type { RateLimitService } from './rate-limit.service.js';
import { processingStaleBefore, visitFieldContext } from './visit.service.js';

/** Generations per UTC day. Guests get fewer; the model runs on a free tier shared by everyone. */
export const DAILY_GENERATION_LIMIT = { registered: 10, guest: 3 } as const;

// Sized so that the worst case, both calls timing out and being retried once,
// still ends inside the platform's 300-second request limit: 2 x 75 + 2 x 45 + pauses.
// A fallback model takes the place of the retry, so it adds nothing to that sum.
const TRANSCRIPTION_TIMEOUT_MS = 75_000;
const NOTE_TIMEOUT_MS = 45_000;
const RETRY_BACKOFF_MS = 1_000;

export type GenerationCaller = {
  userId: string;
  isGuest: boolean;
};

export type GenerationInput = {
  audio: AudioInput;
  durationSec: number;
  /** The caller confirmed that an existing note may be replaced. */
  replaceExisting: boolean;
};

export type GenerationService = {
  /**
   * Checks everything that can be refused up front (ownership, consent, a run
   * already in flight, the daily quota) and rejects with an `AppError` if any
   * fails. Once it resolves, the returned stream never throws: a failure
   * during generation arrives as a final `error` event.
   */
  begin: (
    caller: GenerationCaller,
    visitId: string,
    input: GenerationInput,
    log: Logger,
  ) => Promise<AsyncIterable<ProcessEvent>>;
};

export type GenerationServiceDependencies = {
  visits: VisitRepository;
  usage: UsageRepository;
  rateLimits: RateLimitService;
  /** Generations allowed per UTC day across all users. */
  dailyBudget: number;
  model: ScribeModel;
  /** A second model per task, tried when the first is overloaded or unavailable. */
  fallbackModel?: ScribeFallbackModel;
  cipher: FieldCipher;
  audit: AuditService;
  now: () => Date;
  /** Injectable so tests do not wait out the retry pause. */
  sleep?: (ms: number) => Promise<void>;
};

/** A failure with a message that is safe to show the user. */
class GenerationFailure extends SafeError {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenerationFailure';
  }
}

function toClientError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof GenerationFailure) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ScribeModelError) {
    // Overloaded, down, out of quota or too slow: nothing is wrong with the
    // recording, and the same request can succeed a little later.
    return error.kind === 'unavailable'
      ? {
          code: 'AI_UNAVAILABLE',
          message: 'The AI service is busy right now. Please try again in a minute.',
        }
      : {
          code: 'AI_FAILED',
          message: 'The AI service could not process this recording. Please try again.',
        };
  }
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
}

/** Which of a task's two models an attempt went to. */
type ModelRoute = 'primary' | 'fallback';

/**
 * Picks the model for an attempt. The first attempt goes to the primary model.
 * The retry goes to the fallback when one is configured and the primary was
 * overloaded or unavailable: a different model is the better bet then. After
 * any other retryable failure, such as unusable output, the primary is asked again.
 */
function chooseModel<T>(
  primary: T,
  fallback: T | undefined,
  previousFailure: unknown,
): { call: T; route: ModelRoute } {
  const primaryUnavailable =
    previousFailure instanceof ScribeModelError && previousFailure.kind === 'unavailable';
  return fallback !== undefined && primaryUnavailable
    ? { call: fallback, route: 'fallback' }
    : { call: primary, route: 'primary' };
}

export function createGenerationService({
  visits,
  usage,
  rateLimits,
  dailyBudget,
  model,
  fallbackModel = {},
  cipher,
  audit,
  now,
  sleep,
}: GenerationServiceDependencies): GenerationService {
  const retry: RetryOptions = {
    isRetryable: (error) => error instanceof ScribeModelError && error.retryable,
    backoffMs: RETRY_BACKOFF_MS,
    ...(sleep === undefined ? {} : { sleep }),
  };

  async function* run(
    caller: GenerationCaller,
    visitId: string,
    { audio, durationSec }: GenerationInput,
    log: Logger,
  ): AsyncGenerator<ProcessEvent> {
    const startedAt = now().getTime();
    try {
      // A retry is logged when it happens, because a run that succeeds on its
      // second attempt would otherwise hide that the first model is failing.
      const logRetry = (stage: ProcessStage, failure: unknown, route: ModelRoute): void => {
        if (failure !== undefined) {
          log.warn({ err: failure, visitId, stage, retryOn: route }, 'model call failed, retrying');
        }
      };

      yield { type: 'stage', stage: 'transcribing' };
      let transcribedBy: ModelRoute = 'primary';
      const transcript = await withOneRetry((failure) => {
        const { call, route } = chooseModel(model.transcribe, fallbackModel.transcribe, failure);
        logRetry('transcribing', failure, route);
        transcribedBy = route;
        return call(audio, AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS));
      }, retry);
      if (transcript.length === 0) {
        throw new GenerationFailure(
          'NO_SPEECH_DETECTED',
          'No speech was found in this recording. Check the microphone and try again.',
        );
      }
      yield { type: 'transcript', transcript };

      yield { type: 'stage', stage: 'drafting' };
      let note: SoapNote | undefined;
      let draftedBy: ModelRoute = 'primary';
      const draft = streamWithOneRetry((failure) => {
        const { call, route } = chooseModel(model.draftNote, fallbackModel.draftNote, failure);
        logRetry('drafting', failure, route);
        draftedBy = route;
        return call(transcript, AbortSignal.timeout(NOTE_TIMEOUT_MS));
      }, retry);
      for await (const event of draft) {
        if (event.type === 'final') {
          note = event.note;
        } else {
          yield { type: 'note', note: event.note };
        }
      }
      if (note === undefined) {
        throw new ScribeModelError('The model stream ended without a note', 'invalid_output');
      }

      const saved = await visits.completeProcessing(visitId, caller.userId, {
        transcriptEnc: cipher.encrypt(
          JSON.stringify(transcript),
          visitFieldContext(visitId, 'transcript'),
        ),
        noteEnc: cipher.encrypt(JSON.stringify(note), visitFieldContext(visitId, 'note')),
        durationSec,
      });
      if (saved === null) {
        throw new GenerationFailure('NOT_FOUND', 'This visit was deleted while it was processing.');
      }

      await audit.record({
        actorId: caller.userId,
        action: 'VISIT_PROCESSED',
        resourceType: 'VISIT',
        resourceId: visitId,
      });
      // Identifiers, counts and versions only: never the transcript or the note.
      log.info(
        {
          visitId,
          turns: transcript.length,
          durationMs: now().getTime() - startedAt,
          transcriptionPrompt: TRANSCRIPTION_PROMPT.version,
          notePrompt: NOTE_PROMPT.version,
          transcriptionModel: transcribedBy,
          noteModel: draftedBy,
        },
        'visit processed',
      );

      yield {
        type: 'done',
        visit: {
          id: saved.id,
          title: saved.title,
          status: saved.status,
          consentAt: saved.consentAt?.toISOString() ?? null,
          durationSec: saved.durationSec,
          createdAt: saved.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString(),
          transcript,
          note,
        },
      };
    } catch (error) {
      log.error({ err: error, visitId }, 'visit processing failed');
      try {
        // Nothing partial is kept: the visit holds either a full result or none.
        await visits.setStatus(visitId, caller.userId, 'FAILED');
      } catch (statusError) {
        // The stale-run rule will release the visit even if this write is lost.
        log.error({ err: statusError, visitId }, 'could not mark visit as failed');
      }
      yield { type: 'error', error: toClientError(error) };
    }
  }

  return {
    begin: async (caller, visitId, input, log) => {
      const visit = await visits.findOwned(visitId, caller.userId);
      if (visit === null) {
        throw new AppError(404, 'NOT_FOUND', 'Visit not found.');
      }
      if (visit.consentAt === null) {
        throw new AppError(
          403,
          'CONSENT_REQUIRED',
          'Consent to record must be confirmed before a visit can be processed.',
        );
      }
      if (visit.noteEnc !== null && !input.replaceExisting) {
        // The note may have been edited by hand. Replacing it has to be asked for.
        throw new AppError(
          409,
          'NOTE_EXISTS',
          'This visit already has a note. Confirm that it should be replaced.',
        );
      }

      const current = now();
      if (
        !(await visits.claimForProcessing(visitId, caller.userId, processingStaleBefore(current)))
      ) {
        throw new AppError(409, 'CONFLICT', 'This visit is already being processed.');
      }

      try {
        const limit = caller.isGuest
          ? DAILY_GENERATION_LIMIT.guest
          : DAILY_GENERATION_LIMIT.registered;
        if ((await usage.increment(caller.userId, current)) > limit) {
          throw new AppError(
            429,
            'QUOTA_EXCEEDED',
            `You have reached the limit of ${String(limit)} generations for today.`,
            { reason: 'daily_quota_reached' },
          );
        }

        // One counter for everyone, kept apart from the per-user rows so that
        // deleting accounts cannot reset it.
        const budget = await rateLimits.consume(
          { name: 'generation-budget', limit: dailyBudget, windowSec: 24 * 60 * 60 },
          'all-users',
        );
        if (!budget.allowed) {
          throw new AppError(
            429,
            'QUOTA_EXCEEDED',
            'The demo has reached its generation limit for today. Please try again tomorrow.',
            { reason: 'daily_budget_reached' },
          );
        }
      } catch (error) {
        // The claim is released, so a refused or failed quota check does not lock the visit.
        await visits.setStatus(visitId, caller.userId, visit.status);
        throw error;
      }

      return run(caller, visitId, input, log);
    },
  };
}
