'use client';

import { useEffect, useRef } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import type { RunState } from './process-run';
import { RunSteps, STEP_LABEL } from './run-steps';

const LARGE = 'h-11 px-5 text-base';

const HEADING: Record<Exclude<RunState['phase'], 'idle'>, string> = {
  running: 'Creating your note',
  done: 'Opening the visit',
  failed: 'The note could not be created',
};

type RunProgressProps = {
  state: Exclude<RunState, { phase: 'idle' }>;
  onRetry: () => void;
  /** Gives up on this attempt and shows the form again, as it was left. */
  onBack: () => void;
};

/**
 * Replaces the form while the recording is on its way: the upload's progress,
 * a way to cancel it, and what went wrong if the API refused it. Once the API
 * starts answering, the browser moves to the visit's page, which takes over.
 */
export function RunProgress({ state, onRetry, onBack }: RunProgressProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The form this replaces held the focus; move it here so keyboard and screen-reader users follow.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const uploading = state.phase === 'running' && state.step === 'uploading';
  const announcement = state.phase === 'running' ? STEP_LABEL[state.step] : HEADING[state.phase];

  return (
    <section aria-labelledby="run-heading" className="space-y-8">
      <div className="space-y-1">
        <h2
          id="run-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          {HEADING[state.phase]}
        </h2>
        {state.phase !== 'done' && <p className="text-muted-foreground">{state.title}</p>}
        {/* Read out as the run moves on, for someone who cannot see the list change. */}
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>

      <RunSteps state={state} />

      {state.phase === 'running' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This usually takes less than a minute. The transcript and the note appear as they are
            written.
          </p>
          {uploading && (
            <Button type="button" variant="outline" className={LARGE} onClick={onBack}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {state.phase === 'failed' && (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{state.failure.message}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-3">
            {state.failure.canRetry && (
              <Button type="button" className={LARGE} onClick={onRetry}>
                Try again
              </Button>
            )}
            <Button type="button" variant="outline" className={LARGE} onClick={onBack}>
              Back to the form
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
