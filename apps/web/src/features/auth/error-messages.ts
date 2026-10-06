import { isApiError } from '@/lib/api/errors';
import { formatWait } from '@/lib/format';

import type { CredentialField, FieldErrors } from './validation';

export type AuthFailure = {
  /** A message for the whole form. */
  form?: string;
  /** Messages that belong to one field. */
  fields?: FieldErrors;
};

const GENERIC = 'Something went wrong. Please try again.';

function isCredentialField(path: string): path is CredentialField {
  return path === 'email' || path === 'password';
}

/**
 * Turns a failed sign-in, registration or guest request into text for the
 * page. Each case says what happened and, where there is one, what to do next.
 */
export function describeAuthError(error: unknown): AuthFailure {
  if (!isApiError(error)) {
    return { form: GENERIC };
  }

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return { form: 'Email or password is incorrect.' };
    case 'EMAIL_TAKEN':
      return { fields: { email: 'An account with this email already exists. Sign in instead.' } };
    case 'RATE_LIMITED':
      return { form: `Too many attempts. Try again in ${formatWait(error.retryAfterSec)}.` };
    case 'VALIDATION_ERROR': {
      const fields: FieldErrors = {};
      for (const detail of error.details) {
        if (isCredentialField(detail.path)) {
          fields[detail.path] ??= detail.message;
        }
      }
      return Object.keys(fields).length > 0 ? { fields } : { form: error.message };
    }
    case 'NETWORK_ERROR':
      return { form: error.message };
    default:
      return { form: GENERIC };
  }
}
