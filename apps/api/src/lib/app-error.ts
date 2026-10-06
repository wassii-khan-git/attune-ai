import type { ErrorCode, ErrorDetail } from '@attune/shared';

/**
 * An expected failure with a decided HTTP status. The message is sent to the
 * client as written, so it must never contain PHI, secrets or internal detail.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: readonly ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}
