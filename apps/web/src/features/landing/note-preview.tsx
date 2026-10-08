import { NOT_DISCUSSED, type SoapNote } from '@attune/shared';
import { Check, Mic } from 'lucide-react';

import { NOTE_SECTIONS } from '@/features/visits/note-text';
import { cn } from '@/lib/utils';

/** An invented note, written by hand: it shows a result before anyone has signed in. */
const EXAMPLE: SoapNote = {
  subjective: 'Sore throat and a dry cough for three days. No fever.',
  objective: 'Throat mildly red. Chest clear on listening.',
  assessment: NOT_DISCUSSED,
  plan: 'Rest, fluids and paracetamol. Come back if it is no better in a week.',
};

/** The heights of a still waveform. */
const BARS = [
  'h-2',
  'h-4',
  'h-6',
  'h-3',
  'h-5',
  'h-7',
  'h-4',
  'h-2',
  'h-5',
  'h-3',
  'h-6',
  'h-4',
  'h-2',
  'h-3',
] as const;

/**
 * A picture of the product for the landing page: a recording that has become
 * a note. It is drawn with the app's own parts, so it follows the theme, and
 * it is hidden from assistive technology because nothing in it can be used.
 */
export function NotePreview() {
  return (
    <div aria-hidden className="relative isolate hidden select-none lg:block">
      <div className="absolute -inset-8 -z-10 rounded-full bg-primary/15 blur-3xl" />

      <div className="relative z-10 -mb-5 ml-6 flex w-fit items-center gap-3 rounded-full border bg-card py-2 pr-5 pl-2 shadow-md">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Mic className="size-4" />
        </span>
        <span className="flex h-7 items-center gap-0.5">
          {BARS.map((height, index) => (
            <span key={index} className={cn('w-1 rounded-full bg-primary/70', height)} />
          ))}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">0:38</span>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-6 pt-9 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <p className="font-semibold">Note</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check className="size-4" />
            Saved
          </p>
        </div>
        {NOTE_SECTIONS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <p className="text-sm font-semibold">{label}</p>
            <p
              className={cn(
                'text-sm leading-relaxed',
                EXAMPLE[key] === NOT_DISCUSSED && 'text-muted-foreground italic',
              )}
            >
              {EXAMPLE[key]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
