import type { SoapNote, Transcript } from '@attune/shared';

import { SafeError } from '../lib/safe-error.js';

export type AudioInput = {
  data: Uint8Array;
  /** The container format detected from the file's own bytes. */
  mediaType: string;
};

export type NoteDraftEvent =
  /** The note so far. Each snapshot replaces the previous one. */
  | { type: 'partial'; note: Partial<SoapNote> }
  /** The complete, schema-validated note. Always the last event. */
  | { type: 'final'; note: SoapNote };

/**
 * The two things the product needs from a language model. The rest of the API
 * depends on this interface only, so the provider can change and tests can
 * substitute a scripted model. The two tasks may be served by different models.
 */
export type ScribeModel = {
  transcribe: (audio: AudioInput, signal: AbortSignal) => Promise<Transcript>;
  draftNote: (transcript: Transcript, signal: AbortSignal) => AsyncIterable<NoteDraftEvent>;
};

/**
 * A second model for each task, tried when the first is overloaded or
 * unavailable. Either task may have none.
 */
export type ScribeFallbackModel = Partial<ScribeModel>;

/**
 * Why a model call failed, as far as the product needs to know:
 * - `unavailable`: the model is overloaded, down, out of quota, gone, or did
 *   not answer in time. Another model may work, and so may this one in a minute.
 * - `invalid_output`: the model answered with something unusable. Output varies
 *   between calls, so one more attempt is worthwhile.
 * - `rejected`: the provider refused this request. Sending it again will not help.
 */
export type ScribeFailureKind = 'unavailable' | 'invalid_output' | 'rejected';

/**
 * Any failure of the model call. The message is written here, never copied
 * from the provider, so it is safe to log.
 */
export class ScribeModelError extends SafeError {
  constructor(
    message: string,
    readonly kind: ScribeFailureKind,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ScribeModelError';
  }

  /** Whether trying once more could help. */
  get retryable(): boolean {
    return this.kind !== 'rejected';
  }
}
