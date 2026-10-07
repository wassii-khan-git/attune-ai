import { MAX_AUDIO_BYTES } from '@attune/shared';
import { describe, expect, it } from 'vitest';

import { AUDIO_ACCEPT, checkAudioDuration, checkAudioFile } from './audio-file';

const file = (name: string, type: string, size = 200_000) => ({ name, type, size });

describe('checkAudioFile', () => {
  it('accepts a file the browser already labels as audio', () => {
    expect(checkAudioFile(file('visit.mp3', 'audio/mpeg'))).toEqual({
      ok: true,
      type: 'audio/mpeg',
    });
  });

  it.each([
    ['clip.webm', 'video/webm', 'audio/webm'],
    ['clip.mp4', 'video/mp4', 'audio/mp4'],
    ['clip.ogg', 'application/ogg', 'audio/ogg'],
    ['CLIP.M4A', '', 'audio/mp4'],
  ])('declares %s (labelled "%s") as %s', (name, type, expected) => {
    expect(checkAudioFile(file(name, type))).toEqual({ ok: true, type: expected });
  });

  it.each([
    ['notes.pdf', 'application/pdf'],
    ['photo.png', 'image/png'],
    ['no-extension', ''],
  ])('refuses %s', (name, type) => {
    const result = checkAudioFile(file(name, type));

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? '' : result.message).toMatch(/does not look like an audio file/);
  });

  it('refuses an empty file', () => {
    expect(checkAudioFile(file('visit.mp3', 'audio/mpeg', 0))).toEqual({
      ok: false,
      message: 'This file is empty.',
    });
  });

  it('accepts a file exactly at the size limit and refuses one byte more', () => {
    expect(checkAudioFile(file('visit.mp3', 'audio/mpeg', MAX_AUDIO_BYTES)).ok).toBe(true);
    expect(checkAudioFile(file('visit.wav', 'audio/wav', 6_500_000))).toEqual({
      ok: false,
      message: 'This file is 6.2 MB. The limit is 4 MB.',
    });
    expect(checkAudioFile(file('visit.mp3', 'audio/mpeg', MAX_AUDIO_BYTES + 1)).ok).toBe(false);
  });

  it('offers the same extensions in the file picker as it accepts', () => {
    expect(AUDIO_ACCEPT).toContain('audio/*');
    expect(AUDIO_ACCEPT).toContain('.m4a');
    expect(AUDIO_ACCEPT).toContain('.webm');
  });
});

describe('checkAudioDuration', () => {
  it('rounds to whole seconds', () => {
    expect(checkAudioDuration(42.4)).toEqual({ ok: true, durationSec: 42 });
    expect(checkAudioDuration(1)).toEqual({ ok: true, durationSec: 1 });
  });

  it('accepts a recording that is five minutes to the nearest second', () => {
    expect(checkAudioDuration(300.4)).toEqual({ ok: true, durationSec: 300 });
  });

  it('refuses a longer recording and says how long it is', () => {
    expect(checkAudioDuration(432)).toEqual({
      ok: false,
      message: 'This recording is 7:12 long. The limit is 5 minutes.',
    });
  });

  it('refuses a recording shorter than a second', () => {
    expect(checkAudioDuration(0.4)).toMatchObject({ ok: false });
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a file whose length could not be read (%s)',
    (seconds) => {
      const result = checkAudioDuration(seconds);

      expect(result.ok ? '' : result.message).toMatch(/could not be read as audio/);
    },
  );
});
