import type { SessionStore } from './session-store';

/** A signed-in session ends after this long without any input, in any tab. */
export const IDLE_LIMIT_MS = 15 * 60 * 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const CHECK_EVERY_MS = 15_000;
/** Activity is written to shared storage at most this often; input events can fire hundreds of times a second. */
const WRITE_EVERY_MS = 5_000;

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export type IdleMonitorOptions = {
  store: SessionStore;
  now: () => number;
  /** Called once, when the limit is reached. */
  onIdle: () => void;
  /** Where input and focus events are listened for: the window, in the browser. */
  target: Listenable;
  limitMs?: number;
  setInterval?: (handler: () => void, ms: number) => unknown;
  clearInterval?: (id: never) => void;
};

export function isIdle(
  lastActivityAt: number | null,
  now: number,
  limitMs = IDLE_LIMIT_MS,
): boolean {
  return lastActivityAt !== null && now - lastActivityAt >= limitMs;
}

/**
 * Watches for inactivity and reports it once.
 *
 * The last-activity time lives in shared storage, so input in one tab keeps
 * every tab alive, and all of them sign out together. It is checked on a
 * timer and again whenever the tab regains focus, because timers are paused
 * while a laptop sleeps: a lid opened after an hour must sign out at once.
 *
 * Returns a function that stops the monitor.
 */
export function startIdleMonitor({
  store,
  now,
  onIdle,
  target,
  limitMs = IDLE_LIMIT_MS,
  setInterval: schedule = globalThis.setInterval,
  clearInterval: cancel = globalThis.clearInterval,
}: IdleMonitorOptions): () => void {
  let lastWriteAt = 0;
  let reported = false;

  const check = (): void => {
    if (!reported && isIdle(store.getLastActivity(), now(), limitMs)) {
      reported = true;
      onIdle();
    }
  };

  const recordActivity = (): void => {
    const current = now();
    // Input after the limit has passed does not revive the session: check first.
    check();
    if (!reported && current - lastWriteAt >= WRITE_EVERY_MS) {
      lastWriteAt = current;
      store.setLastActivity(current);
    }
  };

  for (const name of ACTIVITY_EVENTS) {
    target.addEventListener(name, recordActivity, { passive: true });
  }
  target.addEventListener('focus', check);
  target.addEventListener('visibilitychange', check);
  const timer = schedule(check, CHECK_EVERY_MS);

  check();

  return () => {
    for (const name of ACTIVITY_EVENTS) {
      target.removeEventListener(name, recordActivity);
    }
    target.removeEventListener('focus', check);
    target.removeEventListener('visibilitychange', check);
    cancel(timer as never);
  };
}
