import { describe, expect, it } from 'vitest';

import type { SelectedAudio } from './selected-audio';
import { suggestTitle, validateNewVisit, type NewVisitValues } from './validation';

const audio: SelectedAudio = {
  source: 'recording',
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  fileName: 'audio.webm',
  durationSec: 42,
  label: 'Your recording',
};

const complete: NewVisitValues = {
  audio,
  title: '  Knee pain follow-up  ',
  recording: false,
};

describe('validateNewVisit', () => {
  it('accepts a complete form and trims the title', () => {
    expect(validateNewVisit(complete)).toEqual({
      ok: true,
      data: { title: 'Knee pain follow-up', audio },
    });
  });

  it('asks for audio when none has been chosen', () => {
    expect(validateNewVisit({ ...complete, audio: null })).toEqual({
      ok: false,
      errors: { audio: 'Record, upload or choose a sample conversation first.' },
    });
  });

  it('asks for a recording in progress to be stopped', () => {
    expect(validateNewVisit({ ...complete, audio: null, recording: true })).toMatchObject({
      ok: false,
      errors: { audio: 'Stop the recording first.' },
    });
  });

  it.each([
    ['', 'Give this visit a title.'],
    ['   ', 'Give this visit a title.'],
    ['x'.repeat(201), 'Use at most 200 characters.'],
  ])('refuses the title "%s"', (title, message) => {
    expect(validateNewVisit({ ...complete, title })).toEqual({
      ok: false,
      errors: { title: message },
    });
  });

  it('reports every problem at once', () => {
    const result = validateNewVisit({ audio: null, title: '', recording: false });

    expect(result.ok ? [] : Object.keys(result.errors)).toEqual(['audio', 'title']);
  });
});

describe('suggestTitle', () => {
  const now = new Date(2026, 9, 7, 14, 30);

  it('uses the name of a sample', () => {
    expect(suggestTitle({ ...audio, source: 'sample', label: 'Sore throat and cough' }, now)).toBe(
      'Sore throat and cough',
    );
  });

  it('dates a recording, and never borrows a file name, which could identify someone', () => {
    const title = suggestTitle({ ...audio, source: 'file', label: 'jane-doe-visit.m4a' }, now);

    expect(title).toMatch(/^Visit on .*2026/);
    expect(title).not.toContain('jane');
  });
});
