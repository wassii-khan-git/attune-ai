import { isApiError } from '@/lib/api/errors';
import { formatWait } from '@/lib/format';

const GENERIC = 'Something went wrong. Please try again.';

/** Why a visit could not be loaded, as a sentence for the page. */
export function describeLoadError(error: unknown): string {
  if (isApiError(error) && error.code === 'NETWORK_ERROR') {
    return error.message;
  }
  if (isApiError(error) && error.code === 'RATE_LIMITED') {
    return `Too many requests. Try again in ${formatWait(error.retryAfterSec)}.`;
  }
  return 'This visit could not be loaded. Please try again.';
}

export type SaveFailure = {
  message: string;
  /** Whether saving again later can work without the user doing anything. */
  retry: boolean;
};

/**
 * Why an edit to the note was not saved. Every message says what happens to
 * the text: it is never discarded, and the page keeps it until it is saved.
 */
export function describeSaveError(error: unknown): SaveFailure {
  if (!isApiError(error)) {
    return { message: 'Not saved. Your changes are kept on this page.', retry: true };
  }
  switch (error.code) {
    case 'NETWORK_ERROR':
      return {
        message:
          'Not saved: the server could not be reached. Your changes are kept and will be saved when it can.',
        retry: true,
      };
    case 'RATE_LIMITED':
      return {
        message: 'Not saved yet: too many changes at once. Saving again shortly.',
        retry: true,
      };
    case 'CONFLICT':
      return {
        message:
          'Not saved: this visit is being processed, and its note cannot be changed until that has finished.',
        retry: false,
      };
    case 'NOT_FOUND':
      return {
        message: 'Not saved: this visit no longer exists. Copy your text if you need it.',
        retry: false,
      };
    case 'UNAUTHENTICATED':
      return {
        message: 'Not saved: your session has ended. Copy your text, then sign in again.',
        retry: false,
      };
    case 'VALIDATION_ERROR':
      return { message: 'Not saved: a section is too long. Shorten it to save.', retry: false };
    default:
      return { message: 'Not saved. Your changes are kept on this page.', retry: true };
  }
}

/** Why a visit could not be deleted. */
export function describeDeleteError(error: unknown): string {
  if (isApiError(error) && error.code === 'NETWORK_ERROR') {
    return error.message;
  }
  if (isApiError(error) && error.code === 'RATE_LIMITED') {
    return `Too many requests. Try again in ${formatWait(error.retryAfterSec)}.`;
  }
  return GENERIC;
}
