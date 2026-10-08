export type RetryOptions = {
  /** Decides whether a failure is worth one more attempt. */
  isRetryable: (error: unknown) => boolean;
  backoffMs: number;
  /** Injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Runs `attempt`, and runs it one more time after a pause if it fails with a
 * retryable error. One retry absorbs a transient provider hiccup without
 * turning a real outage into a long wait for the user.
 *
 * The second call is given the failure that caused it, so the caller can take
 * a different route the second time.
 */
export async function withOneRetry<T>(
  attempt: (previousFailure?: unknown) => Promise<T>,
  { isRetryable, backoffMs, sleep = realSleep }: RetryOptions,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }
    await sleep(backoffMs);
    return attempt(error);
  }
}

/** The same policy for a stream: if it fails, the whole stream is started again once. */
export async function* streamWithOneRetry<T>(
  attempt: (previousFailure?: unknown) => AsyncIterable<T>,
  { isRetryable, backoffMs, sleep = realSleep }: RetryOptions,
): AsyncGenerator<T> {
  let failure: unknown;
  try {
    yield* attempt();
    return;
  } catch (error) {
    if (!isRetryable(error)) {
      throw error;
    }
    failure = error;
  }
  await sleep(backoffMs);
  yield* attempt(failure);
}
