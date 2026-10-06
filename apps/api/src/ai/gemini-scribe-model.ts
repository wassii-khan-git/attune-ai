import { soapNoteSchema, transcriptSchema } from '@attune/shared';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { APICallError, generateText, Output, streamText } from 'ai';
import { z } from 'zod';

import { NOTE_PROMPT, TRANSCRIPTION_PROMPT } from './prompts.js';
import { ScribeModelError, type ScribeModel } from './scribe-model.js';

const transcriptionOutput = Output.object({ schema: z.object({ turns: transcriptSchema }) });
const noteOutput = Output.object({ schema: soapNoteSchema });

/** Request timeouts and aborts surface under these names. */
const ABORT_ERROR_NAMES = new Set(['AbortError', 'TimeoutError']);

/**
 * Normalises every failure to a `ScribeModelError`. Only an explicit provider
 * verdict or a timeout decides retryability. A response that failed schema
 * validation is worth one more attempt, because output varies between calls.
 */
function toScribeModelError(error: unknown): ScribeModelError {
  if (error instanceof ScribeModelError) {
    return error;
  }
  if (APICallError.isInstance(error)) {
    return new ScribeModelError('The model request failed', error.isRetryable, { cause: error });
  }
  if (error instanceof Error && ABORT_ERROR_NAMES.has(error.name)) {
    return new ScribeModelError('The model request timed out', true, { cause: error });
  }
  return new ScribeModelError('The model returned an unusable response', true, { cause: error });
}

export type GeminiScribeModelOptions = {
  apiKey: string;
  /** From `GEMINI_MODEL`. Never hardcoded, so a model change is a config change. */
  modelId: string;
};

/**
 * Gemini through the Vercel AI SDK. Retries are switched off here because the
 * generation service owns the retry policy; two layers of retries would
 * multiply each other.
 */
export function createGeminiScribeModel({
  apiKey,
  modelId,
}: GeminiScribeModelOptions): ScribeModel {
  const model = createGoogleGenerativeAI({ apiKey })(modelId);

  return {
    transcribe: async (audio, signal) => {
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
        throw toScribeModelError(error);
      }
    },

    draftNote: async function* (transcript, signal) {
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

        for await (const note of result.partialOutputStream) {
          yield { type: 'partial', note };
        }
        if (streamError !== undefined) {
          throw toScribeModelError(streamError);
        }
        yield { type: 'final', note: await result.output };
      } catch (error) {
        throw toScribeModelError(streamError ?? error);
      }
    },
  };
}
