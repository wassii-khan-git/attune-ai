import type { VisitSummary } from '@attune/shared';
import { describe, expect, it } from 'vitest';

import {
  INITIAL_VISIT_LIST,
  reduceVisitList,
  visitStatusLabel,
  type VisitListAction,
  type VisitListState,
} from './visit-list-state';

function visit(number: number, title = `Visit ${String(number)}`): VisitSummary {
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    title,
    status: 'READY',
    consentAt: '2026-10-07T12:00:00.000Z',
    durationSec: 38,
    createdAt: '2026-10-07T12:00:00.000Z',
    updatedAt: '2026-10-07T12:01:00.000Z',
  };
}

function play(...actions: VisitListAction[]): VisitListState {
  return actions.reduce(reduceVisitList, INITIAL_VISIT_LIST);
}

const firstPage = { items: [visit(1), visit(2)], nextCursor: 'cursor-1' };

describe('reduceVisitList', () => {
  it('starts out loading all visits', () => {
    expect(INITIAL_VISIT_LIST).toMatchObject({ query: '', status: 'loading', items: [] });
  });

  it('shows the first page and remembers that there is more', () => {
    expect(play({ type: 'loaded', query: '', page: firstPage })).toMatchObject({
      status: 'ready',
      items: firstPage.items,
      nextCursor: 'cursor-1',
    });
  });

  it('keeps the current visits on screen while a new search loads', () => {
    const searching = play(
      { type: 'loaded', query: '', page: firstPage },
      { type: 'search', query: 'knee' },
    );

    expect(searching).toMatchObject({ query: 'knee', status: 'loading', items: firstPage.items });
  });

  it('replaces the visits when the search has answered', () => {
    const found = play(
      { type: 'loaded', query: '', page: firstPage },
      { type: 'search', query: 'knee' },
      { type: 'loaded', query: 'knee', page: { items: [visit(7, 'Knee pain')], nextCursor: null } },
    );

    expect(found).toMatchObject({ status: 'ready', nextCursor: null });
    expect(found.items.map((item) => item.title)).toEqual(['Knee pain']);
  });

  it('drops an answer that belongs to an earlier search', () => {
    const state = play({ type: 'search', query: 'kn' }, { type: 'search', query: 'knee' });
    const late = { type: 'loaded', query: 'kn', page: firstPage } as const;

    expect(reduceVisitList(state, late)).toBe(state);
    expect(reduceVisitList(state, { type: 'failed', query: 'kn', message: 'x' })).toBe(state);
    expect(reduceVisitList(state, { type: 'more-loaded', query: 'kn', page: firstPage })).toBe(
      state,
    );
  });

  it('records why the first page failed, and shows no stale visits', () => {
    const failed = play(
      { type: 'loaded', query: '', page: firstPage },
      { type: 'search', query: 'knee' },
      { type: 'failed', query: 'knee', message: 'Could not reach the server.' },
    );

    expect(failed).toMatchObject({
      status: 'failed',
      items: [],
      error: 'Could not reach the server.',
    });
  });

  it('adds the next page to the end, without repeating a visit', () => {
    const more = play(
      { type: 'loaded', query: '', page: firstPage },
      { type: 'more-started' },
      { type: 'more-loaded', query: '', page: { items: [visit(2), visit(3)], nextCursor: null } },
    );

    expect(more.items.map((item) => item.title)).toEqual(['Visit 1', 'Visit 2', 'Visit 3']);
    expect(more).toMatchObject({ more: 'idle', nextCursor: null });
  });

  it('keeps what is loaded when the next page fails, so it can be asked for again', () => {
    const state = play(
      { type: 'loaded', query: '', page: firstPage },
      { type: 'more-started' },
      { type: 'more-failed', query: '', message: 'Could not reach the server.' },
    );

    expect(state).toMatchObject({
      status: 'ready',
      items: firstPage.items,
      nextCursor: 'cursor-1',
      more: 'failed',
      moreError: 'Could not reach the server.',
    });
    expect(reduceVisitList(state, { type: 'more-started' })).toMatchObject({
      more: 'loading',
      moreError: null,
    });
  });

  it('forgets a pending "load more" when a new search starts', () => {
    const state = play(
      { type: 'loaded', query: '', page: firstPage },
      { type: 'more-started' },
      { type: 'search', query: 'knee' },
    );

    expect(state).toMatchObject({ more: 'idle', moreError: null });
  });
});

describe('visitStatusLabel', () => {
  it('labels every status except a finished visit', () => {
    expect(visitStatusLabel('READY')).toBeNull();
    expect(visitStatusLabel('PROCESSING')).toBe('Processing');
    expect(visitStatusLabel('FAILED')).toBe('Failed');
    expect(visitStatusLabel('DRAFT')).toBe('Draft');
  });
});
