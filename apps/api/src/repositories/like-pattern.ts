/**
 * Prisma passes a `contains` value straight into a LIKE pattern, where `%` and
 * `_` are wildcards. Escaping them makes a search for "100%" look for those
 * four characters instead of matching everything.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
