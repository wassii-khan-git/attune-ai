'use client';

import { Check, Circle, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { Spinner } from '@/components/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { APP_HOME } from '@/lib/navigation';
import { cn } from '@/lib/utils';

import { RUN_STEPS, stepStatus, type RunState, type RunStep, type StepStatus } from './process-run';

const LARGE = 'h-11 px-5 text-base';

const STEP_LABEL: Record<RunStep, string> = {
  uploading: 'Uploading the recording',
  transcribing: 'Transcribing the conversation',
  drafting: 'Drafting the note',
};

const HEADING: Record<Exclude<RunState['phase'], 'idle'>, string> = {
  running: 'Creating your note',
  done: 'Your note is ready',
  failed: 'The note could not be created',
};

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'active':
      return <Spinner className="size-5 text-primary" />;
    case 'complete':
      return <Check aria-hidden className="size-5 text-primary" />;
    case 'failed':
      return <X aria-hidden className="size-5 text-destructive" />;
    case 'waiting':
      return <Circle aria-hidden className="size-5 text-border" />;
  }
}

/** What to say beside a step: how far the upload is, or what a finished step produced. */
function stepDetail(state: RunState, step: RunStep, status: StepStatus): string | null {
  if (step === 'uploading' && status === 'active' && state.phase === 'running') {
    return `${String(Math.round(state.uploadFraction * 100))}%`;
  }
  if (step === 'transcribing' && status === 'complete' && state.phase !== 'idle') {
    const turns = state.phase === 'failed' ? null : state.turns;
    return turns === null ? null : `${String(turns)} ${turns === 1 ? 'turn' : 'turns'}`;
  }
  return null;
}

type RunProgressProps = {
  state: Exclude<RunState, { phase: 'idle' }>;
  /** The title of the visit being created. */
  title: string;
  onRetry: () => void;
  /** Gives up on this attempt and shows the form again, as it was left. */
  onBack: () => void;
  /** Clears everything for a new visit. */
  onAnother: () => void;
};

/**
 * Replaces the form while a note is being made: the three steps, how far each
 * one is, and at the end either the result or what went wrong and what to do.
 */
export function RunProgress({ state, title, onRetry, onBack, onAnother }: RunProgressProps) {
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
        <p className="text-muted-foreground">{title}</p>
        {/* Read out as the run moves on, for someone who cannot see the list change. */}
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>

      <ol className="space-y-5">
        {RUN_STEPS.map((step) => {
          const status = stepStatus(state, step);
          const detail = stepDetail(state, step, status);
          return (
            <li
              key={step}
              className="space-y-2"
              aria-current={status === 'active' ? 'step' : false}
            >
              <div className="flex items-center gap-3">
                <StepIcon status={status} />
                <span className={cn('flex-1', status === 'waiting' && 'text-muted-foreground')}>
                  {STEP_LABEL[step]}
                </span>
                {detail !== null && (
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">
                    {detail}
                  </span>
                )}
              </div>
              {step === 'uploading' && status === 'active' && state.phase === 'running' && (
                <div
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(state.uploadFraction * 100)}
                  className="ml-8 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${String(state.uploadFraction * 100)}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {state.phase === 'running' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This usually takes less than a minute. You can keep this page open or come back later:
            the note is saved to the visit when it is finished.
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

      {state.phase === 'done' && (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            The transcript and the note are saved with this visit, encrypted. The recording itself
            was not kept.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={APP_HOME} className={cn(buttonVariants(), LARGE)}>
              Back to visits
            </Link>
            <Button type="button" variant="outline" className={LARGE} onClick={onAnother}>
              Start another visit
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
