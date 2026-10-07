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

/** A length of time as minutes and seconds, such as `0:42` or `5:00`. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

/** A file size in the unit a person would use, such as `164 KB` or `1.2 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} bytes`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${String(Math.round(kilobytes))} KB`;
  }
  // One decimal place, without a trailing ".0".
  return `${String(Number((kilobytes / 1024).toFixed(1)))} MB`;
}
