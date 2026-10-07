import { MAX_AUDIO_BYTES, MAX_RECORDING_SEC } from '@attune/shared';
import { describe, expect, it } from 'vitest';

import { pickRecordingFormat, RECORDING_BITS_PER_SECOND } from './recording-format';

const supporting =
  (...types: string[]) =>
  (mimeType: string) =>
    types.includes(mimeType);

describe('recording format', () => {
  it('prefers Opus in WebM, which Chrome, Edge and Firefox record', () => {
    const format = pickRecordingFormat(
      supporting('audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'),
    );

    expect(format).toMatchObject({ containerType: 'audio/webm', extension: 'webm' });
  });

  it('falls back to AAC in MP4 for a browser that records nothing else', () => {
    expect(pickRecordingFormat(supporting('audio/mp4'))).toMatchObject({
      containerType: 'audio/mp4',
      extension: 'm4a',
    });
  });

  it('returns null when the browser can record none of the formats', () => {
    expect(pickRecordingFormat(() => false)).toBeNull();
  });

  it('keeps the longest allowed recording well under the upload limit', () => {
    const largestRecording = (RECORDING_BITS_PER_SECOND / 8) * MAX_RECORDING_SEC;

    expect(largestRecording).toBeLessThan(MAX_AUDIO_BYTES / 2);
  });
});
