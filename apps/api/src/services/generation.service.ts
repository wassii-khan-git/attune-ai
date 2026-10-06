import type { ErrorCode, ProcessEvent, SoapNote } from '@attune/shared';

import { NOTE_PROMPT, TRANSCRIPTION_PROMPT } from '../ai/prompts.js';
import { ScribeModelError, type AudioInput, type ScribeModel } from '../ai/scribe-model.js';
import { AppError } from '../lib/app-error.js';
import type { FieldCipher } from '../lib/field-cipher.js';
import type { Logger } from '../lib/logger.js';
import { streamWithOneRetry, withOneRetry, type RetryOptions } from '../lib/retry.js';
import type { UsageRepository } from '../repositories/usage.repository.js';
import type { VisitRepository } from '../repositories/visit.repository.js';
import type { AuditService } from './audit.service.js';
import { processingStaleBefore, visitFieldContext } from './visit.service.js';

/** Generations per UTC day. Guests get fewer; the model runs on a free tier shared by everyone. */
export const DAILY_GENERATION_LIMIT = { registered: 10, guest: 3 } as const;

const TRANSCRIPTION_TIMEOUT_MS = 90_000;
const NOTE_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = 1_000;

export type GenerationCaller = {
  userId: string;
  isGuest: boolean;
};

export type GenerationInput = {
  audio: AudioInput;
  durationSec: number | undefined;
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
  model: ScribeModel;
  cipher: FieldCipher;
  audit: AuditService;
  now: () => Date;
  /** Injectable so tests do not wait out the retry pause. */
  sleep?: (ms: number) => Promise<void>;
};

/** A failure with a message that is safe to show the user. */
class GenerationFailure extends Error {
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
    return {
      code: 'AI_UNAVAILABLE',
      message: 'The AI service could not process this recording. Please try again.',
    };
  }
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
}

export function createGenerationService({
  visits,
  usage,
  model,
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
      yield { type: 'stage', stage: 'transcribing' };
      const transcript = await withOneRetry(
        () => model.transcribe(audio, AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS)),
        retry,
      );
      if (transcript.length === 0) {
        throw new GenerationFailure(
          'NO_SPEECH_DETECTED',
          'No speech was found in this recording. Check the microphone and try again.',
        );
      }
      yield { type: 'transcript', transcript };

      yield { type: 'stage', stage: 'drafting' };
      let note: SoapNote | undefined;
      const draft = streamWithOneRetry(
        () => model.draftNote(transcript, AbortSignal.timeout(NOTE_TIMEOUT_MS)),
        retry,
      );
      for await (const event of draft) {
        if (event.type === 'final') {
          note = event.note;
        } else {
          yield { type: 'note', note: event.note };
        }
      }
      if (note === undefined) {
        throw new ScribeModelError('The model stream ended without a note', false);
      }

      const saved = await visits.completeProcessing(visitId, caller.userId, {
        transcriptEnc: cipher.encrypt(
          JSON.stringify(transcript),
          visitFieldContext(visitId, 'transcript'),
        ),
        noteEnc: cipher.encrypt(JSON.stringify(note), visitFieldContext(visitId, 'note')),
        durationSec: durationSec ?? null,
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
