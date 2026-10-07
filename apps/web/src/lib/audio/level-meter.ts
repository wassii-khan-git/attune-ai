/**
 * The loudest point in a block of 8-bit waveform samples, from 0 (silence) to
 * 1 (full scale). In this format 128 is the centre line.
 */
export function peakLevel(samples: Uint8Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample - 128));
  }
  return Math.min(peak / 128, 1);
}

/**
 * Turns a level into the share of the display a bar should fill. Ordinary
 * speech peaks far below full scale, so a square-root curve lifts quiet
 * passages into view without letting loud ones leave the display.
 */
export function barHeight(level: number): number {
  return Math.min(Math.sqrt(Math.max(level, 0)), 1);
}

export type LevelHistory = {
  push: (level: number) => void;
  /** The most recent levels, oldest first, at most `count` of them. */
  latest: (count: number) => readonly number[];
};

/** Remembers the last `capacity` levels: what the scrolling waveform draws. */
export function createLevelHistory(capacity: number): LevelHistory {
  const levels: number[] = [];
  return {
    push: (level) => {
      levels.push(level);
      if (levels.length > capacity) {
        levels.shift();
      }
    },
    latest: (count) => (count <= 0 ? [] : levels.slice(-count)),
  };
}
