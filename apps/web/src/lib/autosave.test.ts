import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAutosaver, type SaveStatus } from './autosave';

/** A save whose outcome the test decides, one call at a time. */
function controlledSave() {
  const calls: { value: string; resolve: () => void; reject: (error: unknown) => void }[] = [];
  const save = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject });
      }),
  );
  return { save, calls };
}

function setup(options: { shouldRetry?: (error: unknown) => boolean } = {}) {
  const { save, calls } = controlledSave();
  const statuses: SaveStatus[] = [];
  const autosaver = createAutosaver<string>({
    save,
    onStatus: (status) => statuses.push(status),
    delayMs: 1_000,
    retryMs: 10_000,
    ...options,
  });
  return { autosaver, save, calls, statuses };
}

/** Lets pending promise callbacks run without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('autosaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves once typing has paused, with the latest text', async () => {
    const { autosaver, save, calls, statuses } = setup();

    autosaver.change('S');
    autosaver.change('So');
    await vi.advanceTimersByTimeAsync(900);
    autosaver.change('Sore throat');
    await vi.advanceTimersByTimeAsync(900);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledExactlyOnceWith('Sore throat');

    calls[0]?.resolve();
    await settle();
    expect(statuses).toEqual(['unsaved', 'unsaved', 'unsaved', 'saving', 'saved']);
  });

  it('sends what was typed during a save as soon as that save has finished, never in parallel', async () => {
    const { autosaver, save, calls, statuses } = setup();

    autosaver.change('first');
    await vi.advanceTimersByTimeAsync(1_000);
    autosaver.change('second');
    autosaver.change('third');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(1);

    calls[0]?.resolve();
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('third');

    calls[1]?.resolve();
    await settle();
    expect(statuses.at(-1)).toBe('saved');
  });

  it('keeps the text when a save fails, and tries again later', async () => {
    const { autosaver, save, calls, statuses } = setup();

    autosaver.change('kept');
    await vi.advanceTimersByTimeAsync(1_000);
    calls[0]?.reject(new Error('offline'));
    await settle();
    expect(statuses.at(-1)).toBe('failed');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('kept');

    calls[1]?.resolve();
    await settle();
    expect(statuses.at(-1)).toBe('saved');
  });

  it('retries with the newer text if more was typed while the failed save was on its way', async () => {
    const { autosaver, save, calls } = setup();

    autosaver.change('old');
    await vi.advanceTimersByTimeAsync(1_000);
    autosaver.change('newer');
    calls[0]?.reject(new Error('offline'));
    await settle();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenLastCalledWith('newer');
  });

  it('does not retry a failure that trying again cannot fix, but still holds the text', async () => {
    const { autosaver, save, calls, statuses } = setup({ shouldRetry: () => false });

    autosaver.change('kept');
    await vi.advanceTimersByTimeAsync(1_000);
    calls[0]?.reject(new Error('gone'));
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('failed');

    // Asking again by hand sends the same text.
    void autosaver.flush();
    await settle();
    expect(save).toHaveBeenLastCalledWith('kept');
  });

  it('saves at once when asked to, without waiting for the pause', async () => {
    const { autosaver, save, calls } = setup();

    autosaver.change('now');
    const flushed = autosaver.flush();
    expect(save).toHaveBeenCalledExactlyOnceWith('now');

    calls[0]?.resolve();
    await expect(flushed).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('has nothing to do when nothing changed', async () => {
    const { autosaver, save, statuses } = setup();

    await autosaver.flush();

    expect(save).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);
  });

  it('stops reporting and retrying once disposed, but lets a last save go out', async () => {
    const { autosaver, save, calls, statuses } = setup();

    autosaver.change('last words');
    void autosaver.flush();
    autosaver.dispose();
    expect(save).toHaveBeenCalledExactlyOnceWith('last words');
    const reported = statuses.length;

    calls[0]?.reject(new Error('offline'));
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(statuses).toHaveLength(reported);
  });

  it('sends nothing for a change that was still waiting when it was disposed', async () => {
    const { autosaver, save } = setup();

    autosaver.change('never sent');
    autosaver.dispose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(save).not.toHaveBeenCalled();
  });
});
