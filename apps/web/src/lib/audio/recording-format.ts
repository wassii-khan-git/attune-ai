/**
 * Speech stays clear at this rate, and a five-minute recording comes to about
 * 1.2 MB, far below the 4 MB an upload may be.
 */
export const RECORDING_BITS_PER_SECOND = 32_000;

export type RecordingFormat = {
  /** What `MediaRecorder` is asked to produce. */
  mimeType: string;
  /** The container alone, without the codec. Used as the type of the finished file. */
  containerType: string;
  extension: string;
};

/**
 * In order of preference. Opus is designed for speech at low bitrates, so it
 * comes first in whichever container the browser offers. AAC in MP4 is the
 * fallback for Safari versions that record nothing else.
 */
const CANDIDATES: readonly RecordingFormat[] = [
  { mimeType: 'audio/webm;codecs=opus', containerType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/ogg;codecs=opus', containerType: 'audio/ogg', extension: 'ogg' },
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', containerType: 'audio/mp4', extension: 'm4a' },
  { mimeType: 'audio/mp4', containerType: 'audio/mp4', extension: 'm4a' },
];

/**
 * Chooses the format to record in. `isSupported` is the browser's own answer
 * (`MediaRecorder.isTypeSupported`). Returns null if it can record none of them.
 */
export function pickRecordingFormat(
  isSupported: (mimeType: string) => boolean,
): RecordingFormat | null {
  return CANDIDATES.find((candidate) => isSupported(candidate.mimeType)) ?? null;
}
