import type { AuthResponse } from '@attune/shared';

import type { SessionStore } from './session-store';

const LOCK_NAME = 'attune-session-refresh';
/** A session another tab renewed counts as fresh if it has at least this long left. */
const FRESH_MARGIN_MS = 30_000;

export type RefreshOutcome =
  /** This tab renewed the session. */
  | { status: 'refreshed'; session: AuthResponse }
  /** Another tab already had, so the new cookies are in place and nothing was sent. */
  | { status: 'already-fresh'; accessExpiresAt: number };

export type RefreshCoordinator = {
  /**
   * Renews the session at most once across all tabs.
   * `observedExpiry` is the expiry this tab last knew about; if the shared
   * store has since moved past it, another tab did the work.
   */
  run: (observedExpiry: number | null) => Promise<RefreshOutcome>;
};

export type RefreshCoordinatorOptions = {
  refresh: () => Promise<AuthResponse>;
  store: SessionStore;
  now: () => number;
  /** The Web Locks API. Absent in old browsers and in tests that do not need it. */
  locks?: Pick<LockManager, 'request'> | undefined;
};

/**
 * Refresh tokens are single use: presenting one twice is treated by the API as
 * theft and ends every session of the user. Two tabs (or two requests in one
 * tab) that notice an expired session at the same moment must therefore not
 * both refresh. This makes them take turns, and lets the second one see that
 * the first has already done it.
 */
export function createRefreshCoordinator({
  refresh,
  store,
  now,
  locks,
}: RefreshCoordinatorOptions): RefreshCoordinator {
  let inFlight: Promise<RefreshOutcome> | undefined;

  async function refreshUnlessDone(observedExpiry: number | null): Promise<RefreshOutcome> {
    const stored = store.getAccessExpiry();
    if (stored !== null && stored !== observedExpiry && stored - now() > FRESH_MARGIN_MS) {
      return { status: 'already-fresh', accessExpiresAt: stored };
    }

    const session = await refresh();
    store.setAccessExpiry(Date.parse(session.accessTokenExpiresAt));
    return { status: 'refreshed', session };
  }

  return {
    run: (observedExpiry) => {
      // Within one tab, concurrent callers share a single attempt.
      const attempt = (): Promise<RefreshOutcome> => refreshUnlessDone(observedExpiry);
      inFlight ??= (
        locks === undefined
          ? attempt()
          : // Across tabs, the browser lets one holder of the lock run at a time.
            locks.request<Promise<RefreshOutcome>>(LOCK_NAME, attempt)
      ).finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    },
  };
}
