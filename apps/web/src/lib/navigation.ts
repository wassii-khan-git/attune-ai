/** Where a signed-in user lands when no destination was asked for. */
export const APP_HOME = '/visits';

/** True for tabs, newlines and the like, which some browsers drop from a URL before using it. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) < 0x20) {
      return true;
    }
  }
  return false;
}

/**
 * Turns a `next` query parameter into a path that is safe to redirect to.
 *
 * The value comes from the URL, so anyone can put anything there. Only a path
 * on this site is accepted: it must start with a single slash. That rules out
 * absolute URLs, protocol-relative ones (`//evil.example`) and the backslash
 * variants some browsers treat the same way, which would otherwise turn the
 * sign-in page into a redirector to other sites.
 */
export function safeNextPath(value: unknown, fallback: string = APP_HOME): string {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return fallback;
  }
  if (value.startsWith('//') || value.includes('\\') || hasControlCharacter(value)) {
    return fallback;
  }
  return value;
}
