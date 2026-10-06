import type { ErrorCode, ErrorDetail } from '@attune/shared';

import { SafeError } from './safe-error.js';

export type AppErrorOptions = {
  /** Field-level problems, for validation failures. */
  details?: readonly ErrorDetail[];
  /**
   * Why the request was refused, as a short fixed keyword for the logs (for
   * example `refresh_token_replayed`). Never shown to the client.
   */
  reason?: string;
  /** The account concerned, when the caller is not signed in as it. An identifier only. */
  userId?: string;
};

/**
 * An expected failure with a decided HTTP status. The message is sent to the
 * client as written, so it must never contain PHI, secrets or internal detail.
 */
export class AppError extends SafeError {
  readonly details: readonly ErrorDetail[] | undefined;
  readonly reason: string | undefined;
  readonly userId: string | undefined;

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    { details, reason, userId }: AppErrorOptions = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.details = details;
    this.reason = reason;
    this.userId = userId;
  }
}
