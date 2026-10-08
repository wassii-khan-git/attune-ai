import { soapNoteSchema, transcriptSchema } from '@attune/shared';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { APICallError, generateText, Output, streamText } from 'ai';
import { z } from 'zod';

import { NOTE_PROMPT, TRANSCRIPTION_PROMPT } from './prompts.js';
import { ScribeModelError, type ScribeFallbackModel, type ScribeModel } from './scribe-model.js';

const transcriptionOutput = Output.object({ schema: z.object({ turns: transcriptSchema }) });
const noteOutput = Output.object({ schema: soapNoteSchema });

/** Request timeouts and aborts surface under these names. */
const ABORT_ERROR_NAMES = new Set(['AbortError', 'TimeoutError']);

/** The provider does not know the model: it was retired, or its name is wrong. */
const MODEL_NOT_FOUND = 404;

/**
 * Normalises every failure to a `ScribeModelError`.
 *
 * The provider's own verdict separates `unavailable` from `rejected`: the SDK
 * marks as retryable exactly the answers that mean "not now" (429 for quota,
 * 5xx for overload or outage, and no answer at all). A timeout is the same
 * situation seen from this side, and so is a model that no longer exists:
 * nothing is wrong with the request, and another model can still answer it.
 * Anything else is a response that could not be used, typically one that
 * failed schema validation.
 *
 * The message names the model, which comes from configuration, and the status
 * code, because the provider's own explanation will not be logged.
 */
export function toScribeModelError(error: unknown, modelId: string): ScribeModelError {
  if (error instanceof ScribeModelError) {
    return error;
  }
  if (APICallError.isInstance(error)) {
    const unavailable = error.isRetryable || error.statusCode === MODEL_NOT_FOUND;
    return new ScribeModelError(
      `The request to model "${modelId}" failed (HTTP ${String(error.statusCode ?? 'no status')})`,
      unavailable ? 'unavailable' : 'rejected',
      { cause: error },
    );
  }
  if (error instanceof Error && ABORT_ERROR_NAMES.has(error.name)) {
    return new ScribeModelError(`The request to model "${modelId}" timed out`, 'unavailable', {
      cause: error,
    });
  }
  return new ScribeModelError(
    `Model "${modelId}" returned an unusable response`,
    'invalid_output',
    { cause: error },
  );
}

/** The model for one task, and the one that stands in for it. */
export type TaskModelIds = {
  modelId: string;
  /** Tried when `modelId` is overloaded or unavailable. */
  fallbackModelId: string | undefined;
};

export type GeminiScribeModelOptions = {
  apiKey: string;
  /** Model ids always come from configuration, so changing a model is a config change. */
  transcription: TaskModelIds;
  note: TaskModelIds;
  /** Injectable so tests can answer in place of the provider. */
  fetch?: typeof fetch;
};

export type GeminiScribeModels = {
  primary: ScribeModel;
  fallback: ScribeFallbackModel;
};

/**
 * Gemini through the Vercel AI SDK, with a model per task. Retries are switched
 * off here because the generation service owns the retry policy, including
 * when to move to a fallback model; two layers of retries would multiply each other.
 */
export function createGeminiScribeModels({
  apiKey,
  transcription,
  note,
  fetch,
}: GeminiScribeModelOptions): GeminiScribeModels {
  const google = createGoogleGenerativeAI({ apiKey, ...(fetch === undefined ? {} : { fetch }) });

  const transcriber = (modelId: string): ScribeModel['transcribe'] => {
    const model = google(modelId);
    return async (audio, signal) => {
      try {
        const { output } = await generateText({
          model,
          output: transcriptionOutput,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: TRANSCRIPTION_PROMPT.text },
                { type: 'file', data: audio.data, mediaType: audio.mediaType },
              ],
            },
          ],
          temperature: 0,
          maxRetries: 0,
          abortSignal: signal,
        });
        return output.turns;
      } catch (error) {
        throw toScribeModelError(error, modelId);
      }
    };
  };

  const noteDrafter = (modelId: string): ScribeModel['draftNote'] => {
    const model = google(modelId);
    return async function* (transcript, signal) {
      let streamError: unknown;
      try {
        const result = streamText({
          model,
          output: noteOutput,
          system: NOTE_PROMPT.text,
          prompt: transcript.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n'),
          temperature: 0,
          maxRetries: 0,
          abortSignal: signal,
          // Without a handler the SDK prints stream errors to the console, and those
          // errors carry the request body, which here is the transcript.
          onError: ({ error }) => {
            streamError = error;
          },
        });

        for await (const partial of result.partialOutputStream) {
          yield { type: 'partial', note: partial };
        }
        if (streamError !== undefined) {
          throw toScribeModelError(streamError, modelId);
        }
        yield { type: 'final', note: await result.output };
      } catch (error) {
        throw toScribeModelError(streamError ?? error, modelId);
      }
    };
  };

  return {
    primary: {
      transcribe: transcriber(transcription.modelId),
      draftNote: noteDrafter(note.modelId),
    },
    fallback: {
      ...(transcription.fallbackModelId === undefined
        ? {}
        : { transcribe: transcriber(transcription.fallbackModelId) }),
      ...(note.fallbackModelId === undefined
        ? {}
        : { draftNote: noteDrafter(note.fallbackModelId) }),
    },
  };
}
