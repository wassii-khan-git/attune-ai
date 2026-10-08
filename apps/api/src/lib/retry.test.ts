import { describe, expect, it, vi } from 'vitest';

import { streamWithOneRetry, withOneRetry } from './retry.js';

const transient = new Error('transient');
const permanent = new Error('permanent');
const isRetryable = (error: unknown) => error === transient;

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

describe('withOneRetry', () => {
  it('returns the first result without waiting', async () => {
    const sleep = vi.fn(() => Promise.resolve());

    await expect(
      withOneRetry(() => Promise.resolve('ok'), { isRetryable, backoffMs: 500, sleep }),
    ).resolves.toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('waits, then tries once more after a retryable failure', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const attempt = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce('ok');

    await expect(withOneRetry(attempt, { isRetryable, backoffMs: 500, sleep })).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('never tries a third time', async () => {
    const attempt = vi.fn().mockRejectedValue(transient);

    await expect(
      withOneRetry(attempt, { isRetryable, backoffMs: 0, sleep: () => Promise.resolve() }),
    ).rejects.toBe(transient);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure that is not retryable', async () => {
    const attempt = vi.fn().mockRejectedValue(permanent);

    await expect(withOneRetry(attempt, { isRetryable, backoffMs: 0 })).rejects.toBe(permanent);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('tells the second attempt what the first one failed with', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce('ok');

    await withOneRetry(attempt, { isRetryable, backoffMs: 0, sleep: () => Promise.resolve() });

    expect(attempt.mock.calls).toEqual([[], [transient]]);
  });
});

describe('streamWithOneRetry', () => {
  /** Yields `items`, then throws `failure` on the listed attempts (1-based). */
  function scripted(items: string[], failure: Error, failOn: number[]) {
    let attempts = 0;
    return {
      get attempts() {
        return attempts;
      },
      stream: async function* () {
        attempts++;
        await Promise.resolve();
        yield* items;
        if (failOn.includes(attempts)) {
          throw failure;
        }
      },
    };
  }
  const options = { isRetryable, backoffMs: 0, sleep: () => Promise.resolve() };

  it('passes a healthy stream through once', async () => {
    const source = scripted(['a', 'b'], transient, []);

    await expect(collect(streamWithOneRetry(() => source.stream(), options))).resolves.toEqual([
      'a',
      'b',
    ]);
    expect(source.attempts).toBe(1);
  });

  it('starts the stream again after a retryable failure', async () => {
    const source = scripted(['a', 'b'], transient, [1]);

    await expect(collect(streamWithOneRetry(() => source.stream(), options))).resolves.toEqual([
      'a',
      'b',
      'a',
      'b',
    ]);
    expect(source.attempts).toBe(2);
  });

  it('tells the second stream what the first one failed with', async () => {
    const source = scripted(['a'], transient, [1]);
    const seen: unknown[] = [];

    await collect(
      streamWithOneRetry((previousFailure) => {
        seen.push(previousFailure);
        return source.stream();
      }, options),
    );

    expect(seen).toEqual([undefined, transient]);
  });

  it('fails after the second broken stream', async () => {
    const source = scripted(['a'], transient, [1, 2]);

    await expect(collect(streamWithOneRetry(() => source.stream(), options))).rejects.toBe(
      transient,
    );
    expect(source.attempts).toBe(2);
  });

  it('does not restart after a failure that is not retryable', async () => {
    const source = scripted(['a'], permanent, [1]);

    await expect(collect(streamWithOneRetry(() => source.stream(), options))).rejects.toBe(
      permanent,
    );
    expect(source.attempts).toBe(1);
  });
});
