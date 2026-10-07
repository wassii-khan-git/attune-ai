'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

const SHOW_OUTCOME_MS = 2_500;

type CopyButtonProps = {
  label: string;
  /** Called at the moment of the click, so the text copied is the text on screen. */
  getText: () => string;
  className?: string;
};

/** Copies text to the clipboard and says, for a moment, whether that worked. */
export function CopyButton({ label, getText, className }: CopyButtonProps) {
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const copy = (): void => {
    // Typed as always present, but missing on pages not served over HTTPS.
    const clipboard = (navigator as Partial<Navigator>).clipboard;
    const written =
      clipboard === undefined ? Promise.reject(new Error()) : clipboard.writeText(getText());
    void written
      .then(
        () => 'copied' as const,
        () => 'failed' as const,
      )
      .then((result) => {
        setOutcome(result);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          setOutcome(null);
        }, SHOW_OUTCOME_MS);
      });
  };

  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={copy}>
        {outcome === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />}
        {outcome === 'copied' ? 'Copied' : outcome === 'failed' ? 'Could not copy' : label}
      </Button>
      {/* Announced from outside the button: text inside a button is its name, not a message. */}
      <span role="status" className="sr-only">
        {outcome === 'copied' && 'Copied to the clipboard'}
        {outcome === 'failed' && 'Copying failed'}
      </span>
    </>
  );
}
