const GIVE_UP_AFTER_MS = 10_000;

/**
 * Measures how long an audio file plays, in seconds, without uploading it.
 * Resolves to null if the browser cannot read it as audio. Browser only.
 *
 * A file written by a live recorder often has no length in its header, and
 * the browser then reports `Infinity`. Seeking far past the end makes it scan
 * the file and report the real length.
 */
export function readAudioDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let seeking = false;

    const finish = (seconds: number | null): void => {
      clearTimeout(timer);
      audio.removeEventListener('loadedmetadata', check);
      audio.removeEventListener('durationchange', check);
      audio.removeEventListener('error', fail);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const check = (): void => {
      if (Number.isFinite(audio.duration)) {
        finish(audio.duration);
      } else if (!seeking) {
        seeking = true;
        audio.currentTime = Number.MAX_SAFE_INTEGER;
      }
    };
    const fail = (): void => {
      finish(null);
    };
    const timer = setTimeout(fail, GIVE_UP_AFTER_MS);

    audio.addEventListener('loadedmetadata', check);
    audio.addEventListener('durationchange', check);
    audio.addEventListener('error', fail);
    audio.preload = 'metadata';
    audio.src = url;
  });
}
