export type Sample = {
  id: string;
  title: string;
  summary: string;
  /** Path of the recording under `public`. */
  url: string;
  /** For display. The length sent with an upload is measured from the file itself. */
  durationSec: number;
};

/**
 * Consultations to try the app with, without recording anything. They are
 * invented and spoken by a speech synthesiser: `scripts/make-samples.mjs`
 * holds their text and rebuilds the files.
 */
export const SAMPLES: readonly Sample[] = [
  {
    id: 'sore-throat',
    title: 'Sore throat and cough',
    summary: 'Three days of symptoms, a short examination and self-care advice.',
    url: '/samples/sore-throat.m4a',
    durationSec: 38,
  },
  {
    id: 'knee-pain',
    title: 'Knee pain after running',
    summary: 'A history, an examination, a likely diagnosis and a four-week plan.',
    url: '/samples/knee-pain.m4a',
    durationSec: 50,
  },
];
