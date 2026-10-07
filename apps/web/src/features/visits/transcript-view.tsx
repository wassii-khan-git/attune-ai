import type { Speaker, Transcript } from '@attune/shared';

import { cn } from '@/lib/utils';

/** The speaker's name is always written out; the colour only helps the eye find the turns. */
const SPEAKER_STYLE: Record<Speaker, string> = {
  Clinician: 'text-primary',
  Patient: 'text-foreground',
  Other: 'text-muted-foreground',
};

/**
 * The conversation, turn by turn, with who said what. The words are model
 * output and are shown as plain text, never as markup.
 */
export function TranscriptView({ transcript }: { transcript: Transcript }) {
  return (
    <ol className="space-y-4">
      {transcript.map((turn, index) => (
        <li key={index} className="space-y-1">
          <p
            className={cn(
              'text-xs font-semibold tracking-wide uppercase',
              SPEAKER_STYLE[turn.speaker],
            )}
          >
            {turn.speaker}
          </p>
          <p className="leading-relaxed whitespace-pre-wrap">{turn.text}</p>
        </li>
      ))}
    </ol>
  );
}
