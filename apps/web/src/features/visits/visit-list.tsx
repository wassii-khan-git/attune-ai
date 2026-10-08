'use client';

import { type VisitSummary } from '@attune/shared';
import { Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Spinner } from '@/components/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Welcome } from '@/features/auth/welcome';
import { formatDateTime, formatDuration } from '@/lib/format';
import { NEW_VISIT, visitPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

import { useProcessRun } from './process-run-provider';
import { useVisitList } from './use-visit-list';
import { describeDeleteError } from './visit-errors';
import { visitStatusLabel } from './visit-list-state';

/** How long typing must pause before the search is sent. */
const SEARCH_DELAY_MS = 300;
const LARGE = 'h-11 px-5 text-base';

type VisitRowProps = {
  visit: VisitSummary;
  /** Left out for a visit that cannot be deleted right now. The button it is given is where the focus returns. */
  onDelete?: (button: HTMLButtonElement) => void;
};

/**
 * One visit: a link to it, and the way to delete it. They sit side by side in
 * one row and are separate controls, so neither can be pressed by mistake for
 * the other with a keyboard or a screen reader.
 */
function VisitRow({ visit, onDelete }: VisitRowProps) {
  const status = visitStatusLabel(visit.status);
  return (
    <li className="flex items-center gap-1 rounded-xl border pr-2 transition-colors hover:bg-muted/60 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <Link
        href={visitPath(visit.id)}
        className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl p-4 outline-none"
      >
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{visit.title}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(visit.createdAt)}
            {visit.durationSec !== null && ` · ${formatDuration(visit.durationSec)} recording`}
          </p>
        </div>
        {status !== null && (
          <Badge
            variant={visit.status === 'FAILED' ? 'destructive' : 'secondary'}
            className="shrink-0"
          >
            {status}
          </Badge>
        )}
      </Link>
      {onDelete !== undefined && (
        <Button
          type="button"
          variant="ghost"
          aria-label={`Delete visit: ${visit.title}`}
          className="size-10 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
          onClick={(event) => {
            onDelete(event.currentTarget);
          }}
        >
          <Trash2 aria-hidden />
        </Button>
      )}
    </li>
  );
}

function Skeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading your visits</span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden className="space-y-2 rounded-xl border p-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * The signed-in home: a welcome by name, then every visit, newest first, with
 * a search by title.
 *
 * What is typed into the search stays in the page. It is not put in the
 * address bar, where it would end up in the browser's history.
 *
 * A visit is deleted from here, not from its own page: each row has a delete
 * button, which asks in a dialog before anything is removed.
 */
export function VisitList() {
  const { state, search, loadMore, refresh, remove } = useVisitList();
  const { state: run, clear } = useProcessRun();
  const [text, setText] = useState('');
  // The visit the delete dialog is asking about. It stays set while the dialog closes.
  const [asking, setAsking] = useState<VisitSummary | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletion, setDeletion] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const [deleted, setDeleted] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Where the focus goes when the dialog closes: back to the row's button, or,
  // once that row is gone, to the heading of the list.
  const focusAfterDialog = useRef<HTMLElement | null>(null);

  // Search once typing has paused. The query in the list state is what was last asked for.
  const wanted = text.trim();
  useEffect(() => {
    if (wanted === state.query) {
      return;
    }
    const timer = setTimeout(() => {
      search(wanted);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [wanted, state.query, search]);

  // A note that finishes while this page is open changes a row: fetch the list again.
  const seenPhase = useRef(run.phase);
  useEffect(() => {
    if (seenPhase.current !== run.phase) {
      seenPhase.current = run.phase;
      if (run.phase === 'done' || run.phase === 'failed') {
        refresh();
      }
    }
  }, [run.phase, refresh]);

  const askToDelete = (visit: VisitSummary, button: HTMLButtonElement): void => {
    focusAfterDialog.current = button;
    setAsking(visit);
    setDeletion({ busy: false, error: null });
    setDeleteOpen(true);
  };

  const confirmDelete = (): void => {
    if (asking === null) {
      return;
    }
    const visit = asking;
    setDeletion({ busy: true, error: null });
    remove(visit.id).then(
      () => {
        // A run that ended for this visit has nothing left to show.
        if (run.phase !== 'idle' && run.visitId === visit.id) {
          clear();
        }
        focusAfterDialog.current = headingRef.current;
        setDeletion({ busy: false, error: null });
        setDeleted(`Deleted the visit “${visit.title}”`);
        setDeleteOpen(false);
      },
      (error: unknown) => {
        setDeletion({ busy: false, error: describeDeleteError(error) });
      },
    );
  };

  const searching = state.query !== '';
  const firstLoad = state.status === 'loading' && state.items.length === 0 && !searching;
  // While the server still has visits to send, an empty page is not an empty list.
  const empty = state.status === 'ready' && state.items.length === 0 && state.nextCursor === null;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <Welcome />
        <Link href={NEW_VISIT} className={cn(buttonVariants(), LARGE)}>
          <Plus aria-hidden />
          New visit
        </Link>
      </div>

      <section aria-labelledby="visits-heading" className="space-y-5">
        <h2
          id="visits-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          Your visits
        </h2>

        <div className="relative">
          <label htmlFor="visit-search" className="sr-only">
            Search visits by title
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="visit-search"
            type="search"
            value={text}
            maxLength={200}
            autoComplete="off"
            placeholder="Search by title"
            className="h-10 pr-10 pl-9 text-base"
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
          {state.status === 'loading' && searching && (
            <Spinner className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>

        {/* Tells a screen reader what the search found, since the list changes without a page load. */}
        <p role="status" className="sr-only">
          {state.status === 'ready' && searching
            ? `${String(state.items.length)} ${state.items.length === 1 ? 'visit matches' : 'visits match'}${state.nextCursor === null ? '' : ' so far'}`
            : ''}
        </p>

        {firstLoad && <Skeleton />}

        {state.status === 'failed' && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
            <Button
              type="button"
              className={LARGE}
              onClick={() => {
                search(state.query);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {empty && !searching && (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="font-medium">No visits yet</p>
            <p className="mt-1 text-muted-foreground">
              Start a new visit to record, upload or try a sample conversation.
            </p>
          </div>
        )}

        {empty && searching && (
          <div className="space-y-4 rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="font-medium">No visits match “{state.query}”</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setText('');
              }}
            >
              Clear the search
            </Button>
          </div>
        )}

        {state.items.length > 0 && (
          <ul
            aria-label="Visits"
            aria-busy={state.status === 'loading'}
            className={cn(
              'space-y-3 transition-opacity',
              state.status === 'loading' && 'opacity-60',
            )}
          >
            {state.items.map((visit) => (
              <VisitRow
                key={visit.id}
                visit={visit}
                // Not while this browser is still creating the visit's note.
                {...(run.phase === 'running' && run.visitId === visit.id
                  ? {}
                  : {
                      onDelete: (button) => {
                        askToDelete(visit, button);
                      },
                    })}
              />
            ))}
          </ul>
        )}

        {state.status === 'ready' && state.nextCursor !== null && (
          <div className="space-y-3 text-center">
            <Button
              type="button"
              variant="outline"
              className={LARGE}
              disabled={state.more === 'loading'}
              onClick={loadMore}
            >
              {state.more === 'loading' ? <Spinner /> : null}
              {state.more === 'loading' ? 'Loading…' : 'Load more'}
            </Button>
            {state.more === 'failed' && (
              <p role="alert" className="text-sm text-destructive">
                {state.moreError}
              </p>
            )}
          </div>
        )}
        {/* Says that a visit has gone, for someone who cannot see its row disappear. */}
        <p role="status" className="sr-only">
          {deleted}
        </p>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this visit?"
        description={
          <>
            <span className="font-medium text-foreground">{asking?.title}</span> will be deleted
            with its transcript and its note. This cannot be undone.
          </>
        }
        confirmLabel="Delete visit"
        busyLabel="Deleting…"
        busy={deletion.busy}
        error={deletion.error}
        finalFocus={focusAfterDialog}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}
