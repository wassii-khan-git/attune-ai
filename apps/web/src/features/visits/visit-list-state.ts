import type { ListVisitsResponse, VisitStatus, VisitSummary } from '@attune/shared';

export type VisitListState = {
  /** The search the list is showing, or loading. Empty for "all visits". */
  query: string;
  /**
   * `loading` while the first page for `query` is on its way. The previous
   * items stay in place meanwhile, so the list does not blink while typing.
   */
  status: 'loading' | 'ready' | 'failed';
  items: readonly VisitSummary[];
  /** Present when the server has more visits than are shown. */
  nextCursor: string | null;
  /** Why the first page could not be loaded. */
  error: string | null;
  /** The "load more" request, which has its own outcome. */
  more: 'idle' | 'loading' | 'failed';
  moreError: string | null;
};

export type VisitListAction =
  | { type: 'search'; query: string }
  | { type: 'loaded'; query: string; page: ListVisitsResponse }
  | { type: 'failed'; query: string; message: string }
  | { type: 'more-started' }
  | { type: 'more-loaded'; query: string; page: ListVisitsResponse }
  | { type: 'more-failed'; query: string; message: string }
  | { type: 'removed'; id: string };

export const INITIAL_VISIT_LIST: VisitListState = {
  query: '',
  status: 'loading',
  items: [],
  nextCursor: null,
  error: null,
  more: 'idle',
  moreError: null,
};

/** Adds a page to the list, skipping any visit that is already in it. */
function append(
  items: readonly VisitSummary[],
  page: readonly VisitSummary[],
): readonly VisitSummary[] {
  const known = new Set(items.map((item) => item.id));
  return [...items, ...page.filter((item) => !known.has(item.id))];
}

/**
 * The state of the visit list: which search it shows, the visits loaded so
 * far, and whether more can be fetched.
 *
 * Every answer names the search it belongs to. One that arrives for an
 * earlier search is dropped, so a slow response can never replace the results
 * of what the user typed after it.
 */
export function reduceVisitList(state: VisitListState, action: VisitListAction): VisitListState {
  switch (action.type) {
    case 'search':
      return {
        ...state,
        query: action.query,
        status: 'loading',
        error: null,
        more: 'idle',
        moreError: null,
      };
    case 'more-started':
      return { ...state, more: 'loading', moreError: null };
    // A deleted visit leaves the list whatever search is showing.
    case 'removed':
      return { ...state, items: state.items.filter((item) => item.id !== action.id) };
    default:
      break;
  }

  if (action.query !== state.query) {
    return state;
  }

  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        status: 'ready',
        items: action.page.items,
        nextCursor: action.page.nextCursor,
        error: null,
        more: 'idle',
        moreError: null,
      };
    case 'failed':
      return { ...state, status: 'failed', items: [], nextCursor: null, error: action.message };
    case 'more-loaded':
      return {
        ...state,
        items: append(state.items, action.page.items),
        nextCursor: action.page.nextCursor,
        more: 'idle',
      };
    case 'more-failed':
      return { ...state, more: 'failed', moreError: action.message };
  }
}

/** What to call a visit's status in the list. A finished visit needs no label. */
export function visitStatusLabel(status: VisitStatus): string | null {
  switch (status) {
    case 'READY':
      return null;
    case 'PROCESSING':
      return 'Processing';
    case 'FAILED':
      return 'Failed';
    case 'DRAFT':
      return 'Draft';
  }
}
