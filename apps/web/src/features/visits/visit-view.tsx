'use client';

import type { VisitDetail } from '@attune/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { ConfirmAction } from '@/components/confirm-action';
import { Spinner } from '@/components/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { isApiError } from '@/lib/api/errors';
import { formatDateTime, formatDuration } from '@/lib/format';
import { APP_HOME, NEW_VISIT } from '@/lib/navigation';
import { cn } from '@/lib/utils';

import { LiveNote } from './live-note';
import { NoteEditor } from './note-editor';
import type { RunState } from './process-run';
import { useProcessRun } from './process-run-provider';
import { RunSteps, STEP_LABEL } from './run-steps';
import { TranscriptView } from './transcript-view';
import { describeDeleteError, describeLoadError } from './visit-errors';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; visit: VisitDetail }
  | { status: 'missing' }
  | { status: 'error'; message: string };

type Deletion = { stage: 'idle' | 'busy' | 'done'; error: string | null };

const TWO_COLUMNS = 'grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]';

/** The top of every state of the page: the way back, the title and a line about the visit. */
function Frame({ title, about, children }: { title: string; about?: string; children: ReactNode }) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href={APP_HOME}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Visits
        </Link>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {about !== undefined && <p className="text-sm text-muted-foreground">{about}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function TranscriptColumn({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="transcript-heading" className="space-y-5 print:hidden">
      <h2 id="transcript-heading" className="text-lg font-semibold">
        Transcript
      </h2>
      {children}
    </section>
  );
}

function aboutVisit(visit: VisitDetail): string {
  const created = formatDateTime(visit.createdAt);
  return visit.durationSec === null
    ? created
    : `${created} · ${formatDuration(visit.durationSec)} recording`;
}

type VisitViewProps = { id: string };

/**
 * One visit: its transcript and its note.
 *
 * It has two sources. A visit that is being created right now is followed
 * live, from the run that the new-visit page started: the transcript appears,
 * then the note is written section by section, then it becomes editable. Any
 * other visit is loaded from the API.
 */
export function VisitView({ id }: VisitViewProps) {
  const { api } = useAuth();
  const { state: runState, retry, clear } = useProcessRun();
  const router = useRouter();

  const runIsHere = runState.phase !== 'idle' && runState.visitId === id;
  // Follow a run only if it was still going when this page opened. A run that had already
  // finished holds the note as first drafted, which later edits have overtaken.
  const [followsRun] = useState(runIsHere && runState.phase !== 'done');
  const live = followsRun && runIsHere ? runState : null;

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [deletion, setDeletion] = useState<Deletion>({ stage: 'idle', error: null });

  // The run supplies the visit while it lasts. Without one, or when it ended
  // without handing over the finished visit, the API is asked.
  const loadFromApi =
    deletion.stage !== 'done' && (live === null || (live.phase === 'done' && live.visit === null));

  const staleRun = !followsRun && runIsHere && runState.phase === 'done';
  useEffect(() => {
    if (staleRun) {
      clear();
    }
  }, [staleRun, clear]);

  useEffect(() => {
    if (!loadFromApi) {
      return;
    }
    const controller = new AbortController();
    api.visits.get(id, controller.signal).then(
      ({ visit }) => {
        setLoad({ status: 'ready', visit });
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setLoad(
          isApiError(error) && error.code === 'NOT_FOUND'
            ? { status: 'missing' }
            : { status: 'error', message: describeLoadError(error) },
        );
      },
    );
    return () => {
      controller.abort();
    };
  }, [api, id, loadFromApi, attempt]);

  const reload = (): void => {
    setLoad({ status: 'loading' });
    setAttempt((current) => current + 1);
  };

  const remove = (): void => {
    setDeletion({ stage: 'busy', error: null });
    api.visits.remove(id).then(
      () => {
        setDeletion({ stage: 'done', error: null });
        if (runIsHere) {
          clear();
        }
        router.replace(APP_HOME);
      },
      (error: unknown) => {
        setDeletion({ stage: 'idle', error: describeDeleteError(error) });
      },
    );
  };

  const deleteSection = (
    <section aria-labelledby="delete-heading" className="space-y-3 border-t pt-8 print:hidden">
      <h2 id="delete-heading" className="text-lg font-semibold">
        Delete this visit
      </h2>
      <p className="text-sm text-muted-foreground">
        Removes the visit with its transcript and note. This cannot be undone.
      </p>
      <ConfirmAction
        label="Delete visit"
        question="Delete this visit, its transcript and its note for good?"
        confirmLabel="Yes, delete it"
        busyLabel="Deleting…"
        busy={deletion.stage !== 'idle'}
        error={deletion.error}
        onConfirm={remove}
      />
    </section>
  );

  if (live !== null && live.phase !== 'done') {
    return <LiveRun state={live} onRetry={retry} deleteSection={deleteSection} />;
  }

  const visit = live?.visit ?? (load.status === 'ready' ? load.visit : null);
  if (visit !== null) {
    return (
      <Frame title={visit.title} about={aboutVisit(visit)}>
        {visit.note !== null ? (
          <div className={TWO_COLUMNS}>
            <NoteEditor visitId={visit.id} title={visit.title} initialNote={visit.note} />
            {visit.transcript !== null && (
              <TranscriptColumn>
                <TranscriptView transcript={visit.transcript} />
              </TranscriptColumn>
            )}
          </div>
        ) : (
          <WithoutNote status={visit.status} onCheckAgain={reload} />
        )}
        {deleteSection}
      </Frame>
    );
  }

  if (load.status === 'missing') {
    return (
      <Frame title="Visit not found">
        <p className="text-muted-foreground">This visit does not exist, or it has been deleted.</p>
        <Link href={APP_HOME} className={cn(buttonVariants(), 'h-11 px-5 text-base')}>
          Back to visits
        </Link>
      </Frame>
    );
  }

  if (load.status === 'error') {
    return (
      <Frame title="Visit">
        <Alert variant="destructive">
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
        <Button type="button" className="h-11 px-5 text-base" onClick={reload}>
          Try again
        </Button>
      </Frame>
    );
  }

  return (
    <div className="flex justify-center py-24" role="status">
      <Spinner className="size-6 text-muted-foreground" />
      <span className="sr-only">Loading the visit</span>
    </div>
  );
}

type LiveRunProps = {
  state: Extract<RunState, { phase: 'running' | 'failed' }>;
  onRetry: () => void;
  deleteSection: ReactNode;
};

/** A visit whose note is being made right now, or whose run has just failed. */
function LiveRun({ state, onRetry, deleteSection }: LiveRunProps) {
  if (state.phase === 'failed') {
    return (
      <Frame title={state.title} about="The note could not be created">
        <RunSteps state={state} />
        <Alert variant="destructive">
          <AlertDescription>{state.failure.message}</AlertDescription>
        </Alert>
        {state.failure.canRetry && (
          <Button type="button" className="h-11 px-5 text-base" onClick={onRetry}>
            Try again
          </Button>
        )}
        {deleteSection}
      </Frame>
    );
  }

  return (
    <Frame title={state.title} about="Creating the note">
      <RunSteps state={state} />
      {/* Read out as the run moves on, for someone who cannot see the page change. */}
      <p role="status" className="sr-only">
        {STEP_LABEL[state.step]}
      </p>
      <div className={TWO_COLUMNS}>
        <LiveNote note={state.note} />
        <TranscriptColumn>
          {state.transcript === null ? (
            <div aria-hidden className="space-y-3">
              <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <TranscriptView transcript={state.transcript} />
          )}
        </TranscriptColumn>
      </div>
    </Frame>
  );
}

type WithoutNoteProps = {
  status: VisitDetail['status'];
  onCheckAgain: () => void;
};

/** A visit that has no note: still being processed, or never got one. */
function WithoutNote({ status, onCheckAgain }: WithoutNoteProps) {
  if (status === 'PROCESSING') {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertTitle>The note is being created</AlertTitle>
          <AlertDescription>
            This usually takes less than a minute. The note appears here once it is finished.
          </AlertDescription>
        </Alert>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-5 text-base"
          onClick={onCheckAgain}
        >
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>
          {status === 'FAILED' ? 'The note could not be created' : 'This visit has no note yet'}
        </AlertTitle>
        <AlertDescription>
          Recordings are never stored, so there is nothing here to process again. Delete this visit
          and start a new one with the recording.
        </AlertDescription>
      </Alert>
      <Link href={NEW_VISIT} className={cn(buttonVariants(), 'h-11 px-5 text-base')}>
        New visit
      </Link>
    </div>
  );
}
