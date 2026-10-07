import { describe, expect, it } from 'vitest';

import { createLineReader } from './ndjson';

describe('line reader', () => {
  it('returns each complete line once', () => {
    const reader = createLineReader();

    expect(reader.push('{"a":1}\n{"b":2}\n')).toEqual(['{"a":1}', '{"b":2}']);
    expect(reader.push('{"c":3}\n')).toEqual(['{"c":3}']);
  });

  it('holds back a line that is cut in the middle until the rest arrives', () => {
    const reader = createLineReader();

    expect(reader.push('{"type":"st')).toEqual([]);
    expect(reader.push('age"}\n{"type"')).toEqual(['{"type":"stage"}']);
    expect(reader.push(':"done"}\n')).toEqual(['{"type":"done"}']);
  });

  it('skips blank lines and accepts Windows line endings', () => {
    const reader = createLineReader();

    expect(reader.push('{"a":1}\r\n\n  \n{"b":2}\r\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('gives up the last line at the end of a stream that has no final newline', () => {
    const reader = createLineReader();
    reader.push('{"a":1}\n{"b":2}');

    expect(reader.flush()).toEqual(['{"b":2}']);
    expect(reader.flush()).toEqual([]);
  });
});
