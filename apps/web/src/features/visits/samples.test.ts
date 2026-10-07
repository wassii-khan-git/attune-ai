import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MAX_AUDIO_BYTES, MAX_RECORDING_SEC } from '@attune/shared';
import { describe, expect, it } from 'vitest';

import { SAMPLES } from './samples';

const publicDir = new URL('../../../public', import.meta.url);

describe('sample consultations', () => {
  it('have unique ids', () => {
    expect(new Set(SAMPLES.map((sample) => sample.id)).size).toBe(SAMPLES.length);
  });

  it.each(SAMPLES)('$id points at an audio file that fits the upload limits', (sample) => {
    const bytes = readFileSync(fileURLToPath(`${publicDir.href}${sample.url}`));

    // An MP4 container announces itself with "ftyp" at byte 4.
    expect(bytes.toString('ascii', 4, 8)).toBe('ftyp');
    expect(bytes.length).toBeLessThanOrEqual(MAX_AUDIO_BYTES);
    expect(sample.durationSec).toBeGreaterThan(0);
    expect(sample.durationSec).toBeLessThanOrEqual(MAX_RECORDING_SEC);
  });
});
