import type { Speaker, Transcript } from '@attune/shared';

import { cn } from '@/lib/utils';

/** The speaker's name is always written out; the colour and the initial only help the eye find the turns. */
const SPEAKER_STYLE: Record<Speaker, { name: string; mark: string }> = {
  Clinician: { name: 'text-primary', mark: 'bg-primary text-primary-foreground' },
  Patient: {
    name: 'text-foreground',
    mark: 'bg-secondary text-secondary-foreground ring-1 ring-border',
  },
  Other: { name: 'text-muted-foreground', mark: 'bg-muted text-muted-foreground' },
};

/**
 * The conversation, turn by turn, with who said what. The words are model
 * output and are shown as plain text, never as markup.
 */
export function TranscriptView({ transcript }: { transcript: Transcript }) {
  return (
    <ol className="space-y-5">
      {transcript.map((turn, index) => {
        const style = SPEAKER_STYLE[turn.speaker];
        return (
          <li key={index} className="flex gap-3">
            <span
              aria-hidden
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                style.mark,
              )}
            >
              {turn.speaker.charAt(0)}
            </span>
            <div className="min-w-0 space-y-1 pt-1">
              <p className={cn('text-xs font-semibold tracking-wide uppercase', style.name)}>
                {turn.speaker}
              </p>
              <p className="leading-relaxed whitespace-pre-wrap">{turn.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
