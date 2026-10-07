import { MAX_AUDIO_BYTES, MAX_RECORDING_SEC } from '@attune/shared';

import { formatBytes, formatDuration } from '@/lib/format';

/** The audio type each accepted file extension stands for. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aac: 'audio/aac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
};

/** For a file input's `accept` attribute. */
export const AUDIO_ACCEPT = [
  'audio/*',
  ...Object.keys(TYPE_BY_EXTENSION).map((extension) => `.${extension}`),
].join(',');

export const AUDIO_FORMATS = 'MP3, M4A, WAV, OGG, WebM or FLAC';

export type Checked<T> = ({ ok: true } & T) | { ok: false; message: string };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Checks a chosen file before any of it is uploaded, and settles the audio
 * type to declare for it.
 *
 * The declared type matters because browsers label some audio files as video
 * (`.webm`, `.mp4`) or leave the type empty, and the API only reads uploads
 * declared as audio. What the file really contains is decided by the API,
 * from its bytes; this check only saves a round trip for an obvious mistake.
 */
export function checkAudioFile(file: {
  name: string;
  type: string;
  size: number;
}): Checked<{ type: string }> {
  const type = file.type.startsWith('audio/')
    ? file.type
    : TYPE_BY_EXTENSION[extensionOf(file.name)];
  if (type === undefined) {
    return { ok: false, message: `This does not look like an audio file. Use ${AUDIO_FORMATS}.` };
  }
  if (file.size === 0) {
    return { ok: false, message: 'This file is empty.' };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      message: `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_AUDIO_BYTES)}.`,
    };
  }
  return { ok: true, type };
}

/**
 * Checks the length the browser measured for a file (null if it could not
 * read one) and rounds it to the whole seconds the API expects.
 */
export function checkAudioDuration(seconds: number | null): Checked<{ durationSec: number }> {
  if (seconds === null || !Number.isFinite(seconds)) {
    return { ok: false, message: `This file could not be read as audio. Use ${AUDIO_FORMATS}.` };
  }
  if (seconds < 1) {
    return { ok: false, message: 'This recording is shorter than one second.' };
  }
  const durationSec = Math.round(seconds);
  if (durationSec > MAX_RECORDING_SEC) {
    return {
      ok: false,
      message: `This recording is ${formatDuration(seconds)} long. The limit is ${String(MAX_RECORDING_SEC / 60)} minutes.`,
    };
  }
  return { ok: true, durationSec };
}
