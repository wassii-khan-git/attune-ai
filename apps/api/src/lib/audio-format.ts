/**
 * Identifies an audio container from the first bytes of the file. The type a
 * client declares is only a claim; this is what the bytes actually are, and it
 * is what gets passed to the model.
 *
 * Returns null for anything that is not one of the supported formats.
 */
export function detectAudioMediaType(bytes: Uint8Array): string | null {
  const ascii = (start: number, text: string): boolean => {
    for (let index = 0; index < text.length; index++) {
      if (bytes[start + index] !== text.charCodeAt(index)) {
        return false;
      }
    }
    return true;
  };

  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) {
    return 'audio/wav';
  }
  if (ascii(0, 'OggS')) {
    return 'audio/ogg';
  }
  if (ascii(0, 'fLaC')) {
    return 'audio/flac';
  }
  if (ascii(0, 'FORM') && (ascii(8, 'AIFF') || ascii(8, 'AIFC'))) {
    return 'audio/aiff';
  }
  if (ascii(4, 'ftyp')) {
    return 'audio/mp4';
  }
  // EBML header: Matroska and WebM.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'audio/webm';
  }
  if (ascii(0, 'ID3')) {
    return 'audio/mpeg';
  }

  // MPEG audio frames start with an 11-bit sync word. The layer bits then tell
  // MP3 (non-zero) from raw AAC in an ADTS stream (zero).
  const [first, second] = bytes;
  if (first === 0xff && second !== undefined && (second & 0xe0) === 0xe0) {
    return (second & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg';
  }

  return null;
}
