import type { SoapNote } from '@attune/shared';
import { describe, expect, it } from 'vitest';

import { checkNote, type Expectations } from './checks.js';

const note: SoapNote = {
  subjective: 'Knee pain for two weeks after a fall.',
  objective: 'Mild swelling of the right knee.',
  assessment: 'Not discussed',
  plan: 'Not discussed',
};

const none: Expectations = { mustContain: [], mustNotInvent: [], notDiscussed: [] };

describe('checkNote', () => {
  it('passes a required fact when any phrasing matches the named section', () => {
    const [result] = checkNote(note, {
      ...none,
      mustContain: [
        { section: 'subjective', label: 'the duration', anyOf: [/14 days/i, /two weeks/i] },
      ],
    });

    expect(result).toEqual({ passed: true, description: 'subjective states the duration' });
  });

  it('fails a required fact that appears only in another section, and shows what was written', () => {
    const [result] = checkNote(note, {
      ...none,
      mustContain: [{ section: 'objective', label: 'the duration', anyOf: [/two weeks/i] }],
    });

    expect(result).toEqual({
      passed: false,
      description: 'objective states the duration',
      actual: note.objective,
    });
  });

  it('fails an invented claim found anywhere when no section is named', () => {
    const [result] = checkNote(
      { ...note, plan: 'Ibuprofen 400 mg as needed.' },
      { ...none, mustNotInvent: [{ label: 'a medication', pattern: /ibuprofen/i }] },
    );

    expect(result).toMatchObject({ passed: false, actual: 'Ibuprofen 400 mg as needed.' });
  });

  it('limits an invented-claim check to its section', () => {
    const invented = { ...note, subjective: 'Patient asked about ibuprofen.' };
    const expectations: Expectations = {
      ...none,
      mustNotInvent: [{ section: 'plan', label: 'a medication', pattern: /ibuprofen/i }],
    };

    expect(checkNote(invented, expectations)[0]?.passed).toBe(true);
  });

  it('requires the exact "Not discussed" wording for an uncovered section', () => {
    const expectations: Expectations = { ...none, notDiscussed: ['assessment', 'plan'] };

    expect(checkNote(note, expectations).map((result) => result.passed)).toEqual([true, true]);
    expect(
      checkNote({ ...note, plan: 'No plan was discussed.' }, expectations).map(
        (result) => result.passed,
      ),
    ).toEqual([true, false]);
  });
});
