'use client';

import type { Transcript, VisitDetail } from '@attune/shared';
import { ArrowLeft, MessagesSquare } from 'lucide-react';
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
import { TranscriptDialog } from './transcript-dialog';
import { describeDeleteError, describeLoadError } from './visit-errors';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; visit: VisitDetail }
  | { status: 'missing' }
  | { status: 'error'; message: string };

type Deletion = { stage: 'idle' | 'busy' | 'done'; error: string | null };

type FrameProps = {
  title: string;
  about?: string;
  /** What can be done with this visit, shown level with the title. */
  actions?: ReactNode;
  children: ReactNode;
};

/** The top of every state of the page: the way back, the title, a line about the visit and its actions. */
function Frame({ title, about, actions, children }: FrameProps) {
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
        <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
          <div className="mr-auto min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold wrap-break-word">{title}</h1>
            {about !== undefined && <p className="text-sm text-muted-foreground">{about}</p>}
          </div>
          {/* `contents` keeps each action a direct item of the row, so one of them can take a row of its own. */}
          {actions !== undefined && <div className="contents print:hidden">{actions}</div>}
        </div>
      </div>
      {children}
    </div>
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
 * One visit: its note, with the transcript one click away, in a dialog.
 *
 * It has two sources. A visit that is being created right now is followed
 * live, from the run that the new-visit page started: the transcript arrives,
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
  // Kept here, above every state of the page, so that an open transcript stays open when the run ends.
  const [transcriptOpen, setTranscriptOpen] = useState(false);

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

  // The button sits beside the title. Its question takes a row of its own under the title, and
  // stays on the page's background: on a card the red button's hover tint would be too faint to read.
  const deleteAction = (
    <ConfirmAction
      label="Delete visit"
      question="Delete this visit, its transcript and its note for good? This cannot be undone."
      confirmLabel="Yes, delete it"
      busyLabel="Deleting…"
      busy={deletion.stage !== 'idle'}
      error={deletion.error}
      className="basis-full rounded-xl border border-destructive/30 p-4"
      onConfirm={remove}
    />
  );

  // One region that outlives every state of the page, so that a screen reader
  // hears a run move on and hears when the note is ready.
  const announcement =
    live === null
      ? ''
      : live.phase === 'running'
        ? STEP_LABEL[live.step]
        : live.phase === 'failed'
          ? 'The note could not be created'
          : 'The note is ready to read and edit';

  const finished = live?.phase === 'done' ? live.visit : null;
  const visit = finished ?? (load.status === 'ready' ? load.visit : null);

  // The transcript belongs to a run while it is being followed, and to a visit that has its note.
  let transcript: Transcript | null = null;
  if (live !== null && live.phase !== 'done') {
    transcript = live.phase === 'running' ? live.transcript : null;
  } else if (visit !== null && visit.note !== null) {
    transcript = visit.transcript;
  }

  // The transcript stays out of sight until it is asked for: the note is what the page is for.
  const transcriptAction = transcript !== null && (
    <Button
      type="button"
      variant="outline"
      className="h-10 px-4"
      aria-haspopup="dialog"
      onClick={() => {
        setTranscriptOpen(true);
      }}
    >
      <MessagesSquare aria-hidden />
      Show transcript
    </Button>
  );

  let content: ReactNode;
  if (live !== null && live.phase !== 'done') {
    content = (
      <LiveRun
        state={live}
        onRetry={retry}
        transcriptAction={transcriptAction}
        deleteAction={deleteAction}
      />
    );
  } else if (visit !== null) {
    content = (
      <Frame
        title={visit.title}
        about={aboutVisit(visit)}
        actions={
          <>
            {transcriptAction}
            {deleteAction}
          </>
        }
      >
        {visit.note !== null ? (
          <NoteEditor visitId={visit.id} title={visit.title} initialNote={visit.note} />
        ) : (
          <WithoutNote status={visit.status} onCheckAgain={reload} />
        )}
      </Frame>
    );
  } else if (load.status === 'missing') {
    content = (
      <Frame title="Visit not found">
        <p className="text-muted-foreground">This visit does not exist, or it has been deleted.</p>
        <Link href={APP_HOME} className={cn(buttonVariants(), 'h-11 px-5 text-base')}>
          Back to visits
        </Link>
      </Frame>
    );
  } else if (load.status === 'error') {
    content = (
      <Frame title="Visit">
        <Alert variant="destructive">
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
        <Button type="button" className="h-11 px-5 text-base" onClick={reload}>
          Try again
        </Button>
      </Frame>
    );
  } else {
    content = (
      <div className="flex justify-center py-24" role="status">
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">Loading the visit</span>
      </div>
    );
  }

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {content}
      {/* Outside the states above, so the dialog is not closed and reopened when one replaces another. */}
      {transcript !== null && (
        <TranscriptDialog
          open={transcriptOpen}
          transcript={transcript}
          onClose={() => {
            setTranscriptOpen(false);
          }}
        />
      )}
    </>
  );
}

type LiveRunProps = {
  state: Extract<RunState, { phase: 'running' | 'failed' }>;
  onRetry: () => void;
  transcriptAction: ReactNode;
  deleteAction: ReactNode;
};

/** A visit whose note is being made right now, or whose run has just failed. */
function LiveRun({ state, onRetry, transcriptAction, deleteAction }: LiveRunProps) {
  if (state.phase === 'failed') {
    return (
      <Frame title={state.title} about="The note could not be created" actions={deleteAction}>
        <RunSteps state={state} />
        <Alert variant="destructive">
          <AlertDescription>{state.failure.message}</AlertDescription>
        </Alert>
        {state.failure.canRetry && (
          <Button type="button" className="h-11 px-5 text-base" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Frame>
    );
  }

  // The transcript's button appears once there is one to show; until then the steps say what is happening.
  return (
    <Frame title={state.title} about="Creating the note" actions={transcriptAction}>
      <RunSteps state={state} />
      <LiveNote note={state.note} />
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
