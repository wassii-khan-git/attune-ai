import { MAX_RECORDING_SEC } from '@attune/shared';

import { checkAudioDuration, checkAudioFile, type Checked } from '@/lib/audio/audio-file';
import { readAudioDuration } from '@/lib/audio/audio-duration';
import type { FinishedRecording } from '@/lib/audio/recorder-session';

import type { Sample } from './samples';

/**
 * The audio a visit will be made from. It lives in this tab's memory only,
 * until it is uploaded; reloading the page discards it.
 */
export type SelectedAudio = {
  source: 'recording' | 'file' | 'sample';
  blob: Blob;
  /**
   * Names the uploaded part. Always a neutral name: a file's own name can
   * describe its contents, and the server has no use for it.
   */
  fileName: string;
  durationSec: number;
  /** What to call it on the page. */
  label: string;
  /** Something the user should know about it, such as having reached the time limit. */
  notice?: string;
};

export const SAMPLE_LOAD_FAILED =
  'The sample could not be loaded. Check your connection and try again.';

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return match?.[1] === undefined ? '' : `.${match[1].toLowerCase()}`;
}

async function fromBlob(
  file: { name: string; type: string; size: number },
  blob: Blob,
  described: Pick<SelectedAudio, 'source' | 'label'>,
): Promise<Checked<{ audio: SelectedAudio }>> {
  const checked = checkAudioFile(file);
  if (!checked.ok) {
    return checked;
  }
  // Same bytes, labelled with the audio type settled above.
  const audioBlob = blob.slice(0, blob.size, checked.type);
  const duration = checkAudioDuration(await readAudioDuration(audioBlob));
  if (!duration.ok) {
    return duration;
  }
  return {
    ok: true,
    audio: {
      ...described,
      blob: audioBlob,
      fileName: `audio${extensionOf(file.name)}`,
      durationSec: duration.durationSec,
    },
  };
}

/** Checks a file the user chose and measures its length. Browser only. */
export function audioFromFile(file: File): Promise<Checked<{ audio: SelectedAudio }>> {
  return fromBlob(file, file, { source: 'file', label: file.name });
}

/** Downloads one of the bundled samples and prepares it like any other file. Browser only. */
export async function audioFromSample(sample: Sample): Promise<Checked<{ audio: SelectedAudio }>> {
  let blob: Blob;
  try {
    const response = await fetch(sample.url);
    if (!response.ok) {
      return { ok: false, message: SAMPLE_LOAD_FAILED };
    }
    blob = await response.blob();
  } catch {
    return { ok: false, message: SAMPLE_LOAD_FAILED };
  }
  return fromBlob({ name: sample.url, type: blob.type, size: blob.size }, blob, {
    source: 'sample',
    label: sample.title,
  });
}

/** Wraps a finished microphone recording. Its length was timed while it was made. */
export function audioFromRecording(
  recording: FinishedRecording,
  endedBy: 'user' | 'limit',
): SelectedAudio {
  const seconds = Math.round(recording.durationMs / 1000);
  return {
    source: 'recording',
    blob: recording.blob,
    fileName: `audio.${recording.format.extension}`,
    durationSec: Math.min(Math.max(seconds, 1), MAX_RECORDING_SEC),
    label: 'Your recording',
    ...(endedBy === 'limit'
      ? { notice: `Recording stopped at the ${String(MAX_RECORDING_SEC / 60)}-minute limit.` }
      : {}),
  };
}
