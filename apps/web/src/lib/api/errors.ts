import { apiErrorSchema, type ErrorCode, type ErrorDetail } from '@attune/shared';

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

/** The request never got an answer: offline, DNS, a dropped connection. */
export function networkError(): ApiError {
  return new ApiError(
    0,
    'NETWORK_ERROR',
    'Could not reach the server. Check your connection and try again.',
  );
}

/** An answer arrived, but not in the shape the API promises. */
export function invalidResponse(status: number): ApiError {
  return new ApiError(status, 'INVALID_RESPONSE', 'The server sent an unexpected response.');
}

/** Builds the error for a refused request from its status, parsed body and `Retry-After` header. */
export function toApiError(
  status: number,
  body: unknown,
  retryAfterHeader: string | null,
): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  if (!parsed.success) {
    return invalidResponse(status);
  }

  const retryAfter = Number(retryAfterHeader);
  const { code, message, details } = parsed.data.error;
  return new ApiError(
    status,
    code,
    message,
    details,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}
