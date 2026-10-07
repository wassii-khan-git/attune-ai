export type SaveStatus =
  /** Everything typed has reached the server. */
  | 'saved'
  /** There are changes waiting for a pause in typing. */
  | 'unsaved'
  | 'saving'
  /** The last attempt failed. The changes are still held, and may be retried. */
  | 'failed';

export type AutosaverOptions<T> = {
  /** Sends one value to the server. Rejects if it could not be saved. */
  save: (value: T) => Promise<void>;
  /** Called on every change of status; `error` accompanies `failed`. */
  onStatus: (status: SaveStatus, error?: unknown) => void;
  /** How long typing must pause before a save is sent. */
  delayMs?: number;
  /** How long to wait before trying a failed save again. */
  retryMs?: number;
  /** False for failures that trying again cannot fix, such as a deleted record. */
  shouldRetry?: (error: unknown) => boolean;
};

export type Autosaver<T> = {
  /** Takes the latest value and schedules a save for the next pause in typing. */
  change: (value: T) => void;
  /** Saves now if anything is waiting. Resolves once nothing is left, or the save has failed. */
  flush: () => Promise<void>;
  /** Stops the timers and the status reports. A save already on its way is not cancelled. */
  dispose: () => void;
};

/**
 * Saves a value that changes as someone types, without them asking.
 *
 * - A save goes out when typing pauses, not on every keystroke.
 * - Only one save is in flight at a time, and each carries the newest value,
 *   so an older save can never land on top of a newer one.
 * - A failed save loses nothing: the newest value is kept and tried again.
 */
export function createAutosaver<T>({
  save,
  onStatus,
  delayMs = 1_000,
  retryMs = 10_000,
  shouldRetry = () => true,
}: AutosaverOptions<T>): Autosaver<T> {
  let waiting: { value: T } | null = null;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const report = (status: SaveStatus, error?: unknown): void => {
    if (!disposed) {
      onStatus(status, error);
    }
  };

  const schedule = (ms: number): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), ms);
  };

  const drain = async (): Promise<void> => {
    // Whatever is typed while a save is on its way is picked up by the next turn of this loop.
    while (waiting !== null) {
      const { value } = waiting;
      waiting = null;
      report('saving');
      try {
        await save(value);
      } catch (error) {
        // Keep the newest value: what was typed during the attempt, or else what it carried.
        waiting ??= { value };
        report('failed', error);
        if (!disposed && shouldRetry(error)) {
          schedule(retryMs);
        }
        return;
      }
    }
    report('saved');
  };

  const run = (): Promise<void> => {
    clearTimeout(timer);
    inFlight ??= drain().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  return {
    change: (value) => {
      waiting = { value };
      if (inFlight === null) {
        report('unsaved');
        schedule(delayMs);
      }
    },
    flush: () => (waiting === null && inFlight === null ? Promise.resolve() : run()),
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
