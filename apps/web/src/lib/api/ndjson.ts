export type LineReader = {
  /** Adds the next piece of text and returns every line it completed. */
  push: (chunk: string) => string[];
  /** Returns what is left when the stream ends without a final newline. */
  flush: () => string[];
};

/**
 * Splits newline-delimited text into lines while it is still arriving. A
 * network chunk can end in the middle of a line, so the unfinished part is
 * held back until the rest of it shows up. Blank lines are dropped.
 */
export function createLineReader(): LineReader {
  let pending = '';

  const complete = (lines: string[]): string[] =>
    lines.map((line) => line.trim()).filter((line) => line !== '');

  return {
    push: (chunk) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      return complete(lines);
    },
    flush: () => {
      const rest = pending;
      pending = '';
      return complete([rest]);
    },
  };
}
