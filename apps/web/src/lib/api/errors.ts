import type { ErrorCode, ErrorDetail } from '@attune/shared';

/** The API's own codes, plus two for failures that never produced an API response. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

/** Every failed call to the API, in one shape the UI can switch on. */
export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never got an answer. */
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details: readonly ErrorDetail[] = [],
    /** From the `Retry-After` header of a throttled request. */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
