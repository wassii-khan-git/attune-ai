import { describe, expect, it, vi } from 'vitest';

import { IDLE_LIMIT_MS, isIdle, startIdleMonitor } from './idle-monitor';
import { createMemorySessionStore } from './testing';

const MINUTE = 60_000;

/** A monitor on a fake clock and a fake window, with the timer under the test's control. */
function setup(startAt = 1_000_000) {
  let now = startAt;
  let tick: () => void = () => undefined;
  const store = createMemorySessionStore();
  store.setLastActivity(now);
  const target = new EventTarget();
  const onIdle = vi.fn();
  const clearInterval = vi.fn();

  const stop = startIdleMonitor({
    store,
    now: () => now,
    onIdle,
    target,
    setInterval: (handler) => {
      tick = handler;
      return 1;
    },
    clearInterval,
  });

  return {
    store,
    onIdle,
    stop,
    clearInterval,
    advance: (ms: number) => {
      now += ms;
    },
    tick: () => {
      tick();
    },
    fire: (name: string) => target.dispatchEvent(new Event(name)),
    now: () => now,
  };
}

describe('isIdle', () => {
  it('is false just under the limit and true at it', () => {
    expect(isIdle(0, IDLE_LIMIT_MS - 1)).toBe(false);
    expect(isIdle(0, IDLE_LIMIT_MS)).toBe(true);
  });

  it('is false when no activity has been recorded yet', () => {
    expect(isIdle(null, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe('idle monitor', () => {
  it('does nothing while the user stays under 15 minutes', () => {
    const monitor = setup();

    monitor.advance(14 * MINUTE);
    monitor.tick();

    expect(monitor.onIdle).not.toHaveBeenCalled();
  });

  it('reports once when 15 minutes pass without input', () => {
    const monitor = setup();

    monitor.advance(15 * MINUTE);
    monitor.tick();
    monitor.tick();

    expect(monitor.onIdle).toHaveBeenCalledTimes(1);
  });

  it('is kept alive by input', () => {
    const monitor = setup();

    monitor.advance(10 * MINUTE);
    monitor.fire('keydown');
    monitor.advance(10 * MINUTE);
    monitor.tick();

    expect(monitor.onIdle).not.toHaveBeenCalled();
    expect(monitor.store.getLastActivity()).toBe(monitor.now() - 10 * MINUTE);
  });

  it('is kept alive by input in another tab, through the shared store', () => {
    const monitor = setup();

    monitor.advance(14 * MINUTE);
    monitor.store.setLastActivity(monitor.now());
    monitor.advance(14 * MINUTE);
    monitor.tick();

    expect(monitor.onIdle).not.toHaveBeenCalled();
  });

  it('signs out as soon as the tab regains focus after a long sleep, without waiting for the timer', () => {
    const monitor = setup();

    monitor.advance(60 * MINUTE);
    monitor.fire('focus');

    expect(monitor.onIdle).toHaveBeenCalledTimes(1);
  });

  it('does not let input after the limit revive the session', () => {
    const monitor = setup();
    const lastActivity = monitor.store.getLastActivity();

    monitor.advance(16 * MINUTE);
    monitor.fire('pointerdown');

    expect(monitor.onIdle).toHaveBeenCalledTimes(1);
    expect(monitor.store.getLastActivity()).toBe(lastActivity);
  });

  it('reports at once if the session was already idle when the page loaded', () => {
    let now = 1_000_000;
    const store = createMemorySessionStore();
    store.setLastActivity(now);
    now += 20 * MINUTE;
    const onIdle = vi.fn();

    startIdleMonitor({
      store,
      now: () => now,
      onIdle,
      target: new EventTarget(),
      setInterval: () => 1,
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('writes activity to shared storage at most every few seconds', () => {
    const monitor = setup();
    const write = vi.spyOn(monitor.store, 'setLastActivity');

    for (let i = 0; i < 50; i++) {
      monitor.advance(10);
      monitor.fire('pointerdown');
    }

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('stops listening and cancels its timer when stopped', () => {
    const monitor = setup();

    monitor.stop();
    monitor.advance(30 * MINUTE);
    monitor.fire('focus');
    monitor.fire('keydown');

    expect(monitor.onIdle).not.toHaveBeenCalled();
    expect(monitor.clearInterval).toHaveBeenCalledWith(1);
  });
});
