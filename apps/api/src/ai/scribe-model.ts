import type { SoapNote, Transcript } from '@attune/shared';

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
 * substitute a scripted model.
 */
export type ScribeModel = {
  transcribe: (audio: AudioInput, signal: AbortSignal) => Promise<Transcript>;
  draftNote: (transcript: Transcript, signal: AbortSignal) => AsyncIterable<NoteDraftEvent>;
};

/** Any failure of the model call. `retryable` says whether trying again could help. */
export class ScribeModelError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ScribeModelError';
  }
}
