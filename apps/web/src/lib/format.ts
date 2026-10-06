/** Says how long to wait, in words, for a number of seconds from a `Retry-After` header. */
export function formatWait(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 60) {
    return 'a minute';
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} minutes`;
  }
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${String(hours)} hours`;
}
