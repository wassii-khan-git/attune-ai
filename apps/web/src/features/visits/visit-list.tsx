'use client';

import { type VisitSummary } from '@attune/shared';
import { ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateTime, formatDuration } from '@/lib/format';
import { NEW_VISIT, visitPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

import { useProcessRun } from './process-run-provider';
import { useVisitList } from './use-visit-list';
import { visitStatusLabel } from './visit-list-state';

/** How long typing must pause before the search is sent. */
const SEARCH_DELAY_MS = 300;
const LARGE = 'h-11 px-5 text-base';

function VisitRow({ visit }: { visit: VisitSummary }) {
  const status = visitStatusLabel(visit.status);
  return (
    <li>
      <Link
        href={visitPath(visit.id)}
        className="flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors outline-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{visit.title}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(visit.createdAt)}
            {visit.durationSec !== null && ` · ${formatDuration(visit.durationSec)} recording`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {status !== null && (
            <Badge variant={visit.status === 'FAILED' ? 'destructive' : 'secondary'}>
              {status}
            </Badge>
          )}
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
        </div>
      </Link>
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
 * The signed-in home: every visit, newest first, with a search by title.
 *
 * What is typed into the search stays in the page. It is not put in the
 * address bar, where it would end up in the browser's history.
 */
export function VisitList() {
  const { state, search, loadMore, refresh } = useVisitList();
  const { state: run } = useProcessRun();
  const [text, setText] = useState('');

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

  const searching = state.query !== '';
  const firstLoad = state.status === 'loading' && state.items.length === 0 && !searching;
  const empty = state.status === 'ready' && state.items.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your visits</h1>
        <Link href={NEW_VISIT} className={cn(buttonVariants(), LARGE)}>
          <Plus aria-hidden />
          New visit
        </Link>
      </div>

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
          className={cn('space-y-3 transition-opacity', state.status === 'loading' && 'opacity-60')}
        >
          {state.items.map((visit) => (
            <VisitRow key={visit.id} visit={visit} />
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
    </div>
  );
}
