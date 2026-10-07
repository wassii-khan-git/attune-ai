import { NOT_DISCUSSED, type SoapNote } from '@attune/shared';

/** The four parts of a note, in the order they are written and read. */
export const NOTE_SECTIONS = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective', label: 'Objective' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan', label: 'Plan' },
] as const satisfies readonly { key: keyof SoapNote; label: string }[];

export type NoteSectionKey = (typeof NOTE_SECTIONS)[number]['key'];

/** What a section says on paper and in a copy: its text, or the standard wording if it is blank. */
export function sectionText(text: string): string {
  return text.trim() === '' ? NOT_DISCUSSED : text.trim();
}

/**
 * The note as plain text, for the clipboard: the visit's title, then each
 * section under its heading. Plain text pastes cleanly into any record system.
 */
export function noteToText(note: SoapNote, title: string): string {
  const sections = NOTE_SECTIONS.map(({ key, label }) => `${label}\n${sectionText(note[key])}`);
  return [title.trim(), ...sections].filter((part) => part !== '').join('\n\n');
}
