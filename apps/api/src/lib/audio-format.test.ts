import { describe, expect, it } from 'vitest';

import { detectAudioMediaType } from './audio-format.js';

const bytes = (...parts: (string | number[])[]): Uint8Array =>
  Buffer.concat(
    parts.map((part) =>
      typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part),
    ),
  );

describe('detectAudioMediaType', () => {
  it.each([
    ['WAV', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '), 'audio/wav'],
    ['Ogg', bytes('OggS', [0, 2, 0, 0]), 'audio/ogg'],
    ['FLAC', bytes('fLaC', [0, 0, 0, 34]), 'audio/flac'],
    ['AIFF', bytes('FORM', [0, 0, 0, 0], 'AIFFCOMM'), 'audio/aiff'],
    ['AIFF-C', bytes('FORM', [0, 0, 0, 0], 'AIFCFVER'), 'audio/aiff'],
    ['MP4 / M4A', bytes([0, 0, 0, 28], 'ftypM4A '), 'audio/mp4'],
    ['WebM', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f]), 'audio/webm'],
    ['MP3 with an ID3 tag', bytes('ID3', [3, 0, 0]), 'audio/mpeg'],
    ['MP3 without a tag', bytes([0xff, 0xfb, 0x90, 0x00]), 'audio/mpeg'],
    ['AAC in ADTS', bytes([0xff, 0xf1, 0x50, 0x80]), 'audio/aac'],
  ])('recognises %s', (_label, input, expected) => {
    expect(detectAudioMediaType(input)).toBe(expected);
  });

  it.each([
    ['a PNG image', bytes([0x89], 'PNG\r\n', [0x1a, 0x0a])],
    ['a PDF', bytes('%PDF-1.7')],
    ['a RIFF file that is not WAVE', bytes('RIFF', [0, 0, 0, 0], 'AVI LIST')],
    ['plain text', bytes('this is not audio')],
    ['an empty file', bytes()],
    ['a single byte', bytes([0xff])],
  ])('rejects %s', (_label, input) => {
    expect(detectAudioMediaType(input)).toBeNull();
  });
});
