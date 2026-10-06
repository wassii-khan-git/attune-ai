import type { SoapNote, Transcript } from '@attune/shared';

import type { AudioInput, ScribeModel } from '../ai/scribe-model.js';

// Synthetic content with distinctive words, so tests can prove it never reaches logs or plaintext storage.
export const FAKE_TRANSCRIPT: Transcript = [
  { speaker: 'Clinician', text: 'What brings you in today?' },
  { speaker: 'Patient', text: 'I have had a sore throat and a mild headache since Sunday.' },
  { speaker: 'Clinician', text: 'Your throat looks red. I recommend rest and fluids.' },
];

export const FAKE_NOTE: SoapNote = {
  subjective: 'Sore throat and mild headache since Sunday.',
  objective: 'Throat erythematous on inspection.',
  assessment: 'Not discussed',
  plan: 'Rest and fluids.',
};

export type FakeScribeModel = ScribeModel & {
  /** Every audio input the model was asked to transcribe. */
  readonly transcribeCalls: AudioInput[];
  /** Every transcript the model was asked to draft a note from. */
  readonly draftCalls: Transcript[];
};

export type FakeScribeModelScript = {
  transcript?: Transcript;
  note?: SoapNote;
  /** Errors to throw from successive `transcribe` calls before one succeeds. */
  transcribeFailures?: unknown[];
  /** Errors to throw from successive `draftNote` calls, after one partial has been emitted. */
  draftFailures?: unknown[];
  /** Called when transcription starts, to let a test act while a run is in flight. */
  onTranscribe?: () => void | Promise<void>;
};

/** A scripted model: same interface as the Gemini adapter, no network. */
export function createFakeScribeModel({
  transcript = FAKE_TRANSCRIPT,
  note = FAKE_NOTE,
  transcribeFailures = [],
  draftFailures = [],
  onTranscribe,
}: FakeScribeModelScript = {}): FakeScribeModel {
  const transcribeCalls: AudioInput[] = [];
  const draftCalls: Transcript[] = [];
  const pendingTranscribeFailures = [...transcribeFailures];
  const pendingDraftFailures = [...draftFailures];

  return {
    transcribeCalls,
    draftCalls,

    transcribe: async (audio) => {
      transcribeCalls.push(audio);
      await onTranscribe?.();
      if (pendingTranscribeFailures.length > 0) {
        throw pendingTranscribeFailures.shift();
      }
      return transcript;
    },

    draftNote: async function* (input) {
      draftCalls.push(input);
      await Promise.resolve();
      yield { type: 'partial', note: { subjective: note.subjective } };
      if (pendingDraftFailures.length > 0) {
        throw pendingDraftFailures.shift();
      }
      yield { type: 'partial', note: { subjective: note.subjective, objective: note.objective } };
      yield { type: 'final', note };
    },
  };
}
