'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

import { useAuth } from '@/features/auth/auth-provider';

import { describeListError } from './visit-errors';
import { INITIAL_VISIT_LIST, reduceVisitList, type VisitListState } from './visit-list-state';

/** Visits fetched per request. The list grows by this many with each "Load more". */
const PAGE_SIZE = 20;

export type VisitList = {
  state: VisitListState;
  /** Shows the visits whose title contains `query`; an empty query shows all of them. */
  search: (query: string) => void;
  /** Fetches the next page of the current search. */
  loadMore: () => void;
  /** Fetches the first page of the current search again, quietly, to pick up changes. */
  refresh: () => void;
};

/**
 * Loads the list of visits, page by page, for the current search.
 *
 * Only one request for a first page is ever in flight: starting another
 * cancels the one before, and the reducer drops any answer that still arrives
 * for an earlier search.
 */
export function useVisitList(): VisitList {
  const { api } = useAuth();
  const [state, dispatch] = useReducer(reduceVisitList, INITIAL_VISIT_LIST);
  const firstPage = useRef<AbortController | null>(null);

  const fetchFirstPage = useCallback(
    (query: string, quiet: boolean) => {
      firstPage.current?.abort();
      const controller = new AbortController();
      firstPage.current = controller;

      api.visits.list({ q: query, limit: PAGE_SIZE }, controller.signal).then(
        (page) => {
          dispatch({ type: 'loaded', query, page });
        },
        (error: unknown) => {
          // A quiet refresh that fails leaves the list as it was.
          if (!controller.signal.aborted && !quiet) {
            dispatch({ type: 'failed', query, message: describeListError(error) });
          }
        },
      );
    },
    [api],
  );

  // The list starts in its loading state, so the first request needs no announcement.
  useEffect(() => {
    fetchFirstPage('', false);
    return () => {
      firstPage.current?.abort();
    };
  }, [fetchFirstPage]);

  const search = useCallback(
    (query: string) => {
      dispatch({ type: 'search', query });
      fetchFirstPage(query, false);
    },
    [fetchFirstPage],
  );

  const { query, nextCursor, status } = state;

  const refresh = useCallback(() => {
    if (status === 'ready') {
      fetchFirstPage(query, true);
    }
  }, [fetchFirstPage, query, status]);

  const loadMore = useCallback(() => {
    if (nextCursor === null) {
      return;
    }
    dispatch({ type: 'more-started' });
    api.visits.list({ q: query, cursor: nextCursor, limit: PAGE_SIZE }).then(
      (page) => {
        dispatch({ type: 'more-loaded', query, page });
      },
      (error: unknown) => {
        dispatch({ type: 'more-failed', query, message: describeListError(error) });
      },
    );
  }, [api, query, nextCursor]);

  return { state, search, loadMore, refresh };
}
