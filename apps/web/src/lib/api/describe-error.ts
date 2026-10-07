import { formatWait } from '@/lib/format';

import { isApiError } from './errors';

/**
 * A sentence for a failed request that needs no special handling. It says so
 * when the server could not be reached or is asking the client to slow down,
 * and uses `fallback` for everything else. The API's own wording for an
 * unexpected failure is never shown.
 */
export function describeRequestError(error: unknown, fallback: string): string {
  if (isApiError(error) && error.code === 'NETWORK_ERROR') {
    return error.message;
  }
  if (isApiError(error) && error.code === 'RATE_LIMITED') {
    return `Too many requests. Try again in ${formatWait(error.retryAfterSec)}.`;
  }
  return fallback;
}
