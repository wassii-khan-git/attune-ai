import { NOT_DISCUSSED, type SoapNote } from '@attune/shared';

export type Section = keyof SoapNote;

/** A fact the note has to state. Any one of the phrasings counts. */
export type RequiredFact = {
  section: Section;
  label: string;
  anyOf: RegExp[];
};

/** Something the transcript never said, so the note must not say it either. */
export type ForbiddenClaim = {
  /** Omit to search the whole note. */
  section?: Section;
  label: string;
  pattern: RegExp;
};

export type Expectations = {
  mustContain: RequiredFact[];
  mustNotInvent: ForbiddenClaim[];
  /** Sections the conversation did not cover. They must read exactly "Not discussed". */
  notDiscussed: Section[];
};

export type CheckResult = {
  passed: boolean;
  description: string;
  /** What the note actually said, for a failed check. */
  actual?: string;
};

const SECTIONS: Section[] = ['subjective', 'objective', 'assessment', 'plan'];

/**
 * Checks a note against a case with plain pattern matching. No model judges
 * another model here: every verdict can be reproduced by reading the note.
 */
export function checkNote(note: SoapNote, expectations: Expectations): CheckResult[] {
  const results: CheckResult[] = [];

  for (const { section, label, anyOf } of expectations.mustContain) {
    const passed = anyOf.some((pattern) => pattern.test(note[section]));
    results.push({
      passed,
      description: `${section} states ${label}`,
      ...(passed ? {} : { actual: note[section] }),
    });
  }

  for (const { section, label, pattern } of expectations.mustNotInvent) {
    const searched = section === undefined ? SECTIONS : [section];
    const offending = searched.find((name) => pattern.test(note[name]));
    results.push({
      passed: offending === undefined,
      description: `${section ?? 'note'} does not invent ${label}`,
      ...(offending === undefined ? {} : { actual: note[offending] }),
    });
  }

  for (const section of expectations.notDiscussed) {
    const passed = note[section].trim() === NOT_DISCUSSED;
    results.push({
      passed,
      description: `${section} is "${NOT_DISCUSSED}"`,
      ...(passed ? {} : { actual: note[section] }),
    });
  }

  return results;
}
