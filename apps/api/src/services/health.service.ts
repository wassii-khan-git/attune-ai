import type { LivenessResponse, ReadinessCheckStatus, ReadinessResponse } from '@attune/shared';

const DEFAULT_CHECK_TIMEOUT_MS = 2_000;

/** A dependency the API cannot serve traffic without. `run` rejects when it is unreachable. */
export type ReadinessCheck = {
  name: string;
  run: () => Promise<void>;
};

export type HealthService = {
  liveness: () => LivenessResponse;
  readiness: () => Promise<ReadinessResponse>;
};

export type HealthServiceOptions = {
  checks: readonly ReadinessCheck[];
  /** Upper bound per check, so a hung dependency yields a 503 rather than a platform timeout. */
  checkTimeoutMs?: number;
};

async function runCheck(check: ReadinessCheck, timeoutMs: number): Promise<ReadinessCheckStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Readiness check "${check.name}" timed out`));
    }, timeoutMs);
  });

  try {
    await Promise.race([check.run(), timeout]);
    return 'ok';
  } catch {
    // The cause is deliberately dropped: dependency errors can carry connection details.
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthService({
  checks,
  checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS,
}: HealthServiceOptions): HealthService {
  return {
    liveness: () => ({ status: 'ok' }),

    readiness: async () => {
      const results = await Promise.all(
        checks.map(async (check) => [check.name, await runCheck(check, checkTimeoutMs)] as const),
      );
      const allOk = results.every(([, status]) => status === 'ok');

      return {
        status: allOk ? 'ready' : 'not_ready',
        checks: Object.fromEntries(results),
      };
    },
  };
}
