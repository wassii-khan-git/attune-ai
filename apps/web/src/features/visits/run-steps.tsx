import { Check, Circle, X } from 'lucide-react';

import { Spinner } from '@/components/spinner';
import { cn } from '@/lib/utils';

import {
  RUN_STEPS,
  stepStatus,
  transcribedTurns,
  type RunState,
  type RunStep,
  type StepStatus,
} from './process-run';

export const STEP_LABEL: Record<RunStep, string> = {
  uploading: 'Uploading the recording',
  transcribing: 'Transcribing the conversation',
  drafting: 'Drafting the note',
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
  if (step === 'transcribing' && status === 'complete') {
    const turns = transcribedTurns(state);
    return turns === null ? null : `${String(turns)} ${turns === 1 ? 'turn' : 'turns'}`;
  }
  return null;
}

/** The three steps of a run and how far each one is, with a bar for the upload. */
export function RunSteps({ state }: { state: Exclude<RunState, { phase: 'idle' }> }) {
  return (
    <ol className="space-y-5">
      {RUN_STEPS.map((step) => {
        const status = stepStatus(state, step);
        const detail = stepDetail(state, step, status);
        return (
          <li key={step} className="space-y-2" aria-current={status === 'active' ? 'step' : false}>
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
  );
}
