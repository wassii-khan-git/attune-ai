import { visitTitleSchema } from '@attune/shared';

import type { SelectedAudio } from './selected-audio';

export type NewVisitField = 'audio' | 'title';
export type NewVisitErrors = Partial<Record<NewVisitField, string>>;

export type NewVisitValues = {
  audio: SelectedAudio | null;
  title: string;
  /** True while the microphone is still recording. */
  recording: boolean;
};

export type NewVisitInput = { title: string; audio: SelectedAudio };

export type NewVisitValidation =
  { ok: true; data: NewVisitInput } | { ok: false; errors: NewVisitErrors };

/**
 * Checks the new-visit form before anything is sent. The title rule is the
 * shared schema's, the same one the API applies. Consent is not a field: the
 * form asks for it in a dialog once these checks pass, and the API refuses to
 * process a visit without it.
 */
export function validateNewVisit(values: NewVisitValues): NewVisitValidation {
  const errors: NewVisitErrors = {};

  if (values.recording) {
    errors.audio = 'Stop the recording first.';
  } else if (values.audio === null) {
    errors.audio = 'Record, upload or choose a sample conversation first.';
  }

  const title = visitTitleSchema.safeParse(values.title);
  if (!title.success) {
    errors.title =
      values.title.trim() === '' ? 'Give this visit a title.' : 'Use at most 200 characters.';
  }

  if (!title.success || values.audio === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data: { title: title.data, audio: values.audio } };
}

/** A starting title, so trying the app does not begin with a required field. */
export function suggestTitle(audio: SelectedAudio, now: Date): string {
  if (audio.source === 'sample') {
    return audio.label;
  }
  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now);
  return `Visit on ${when}`;
}
