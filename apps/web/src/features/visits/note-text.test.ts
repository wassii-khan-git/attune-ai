import { describe, expect, it } from 'vitest';

import { NOTE_SECTIONS, noteToText, sectionText } from './note-text';

const note = {
  subjective: 'Sore throat and dry cough for three days.',
  objective: 'Temperature 37.2.\nThroat red, chest clear.',
  assessment: 'Viral upper respiratory infection.',
  plan: 'Rest and fluids.',
};

describe('noteToText', () => {
  it('lists the sections in SOAP order under the title, keeping line breaks', () => {
    expect(noteToText(note, 'Sore throat and cough')).toBe(
      [
        'Sore throat and cough',
        'Subjective\nSore throat and dry cough for three days.',
        'Objective\nTemperature 37.2.\nThroat red, chest clear.',
        'Assessment\nViral upper respiratory infection.',
        'Plan\nRest and fluids.',
      ].join('\n\n'),
    );
  });

  it('writes "Not discussed" for a blank section instead of leaving a bare heading', () => {
    const text = noteToText({ ...note, assessment: '   ' }, 'Visit');

    expect(text).toContain('Assessment\nNot discussed');
  });

  it('leaves out a blank title', () => {
    expect(noteToText(note, '  ').startsWith('Subjective\n')).toBe(true);
  });
});

describe('sectionText', () => {
  it('trims the text and fills in for a blank section', () => {
    expect(sectionText('  Rest.  ')).toBe('Rest.');
    expect(sectionText('')).toBe('Not discussed');
  });
});

describe('NOTE_SECTIONS', () => {
  it('covers the four SOAP sections in order', () => {
    expect(NOTE_SECTIONS.map((section) => section.key)).toEqual([
      'subjective',
      'objective',
      'assessment',
      'plan',
    ]);
  });
});
