import type { ProcessEvent } from '@attune/shared';
import { describe, expect, it, vi } from 'vitest';

import { createApi } from './endpoints';
import type { HttpClient } from './http';
import type { UploadStreamOptions } from './upload-stream';

const VISIT_ID = '2f1c7c1e-6a54-4b6f-9d1e-0c9f5a3b7e21';

/** An HTTP client whose upload answers with the given lines. */
function clientAnswering(...lines: unknown[]) {
  const stream = vi.fn((_path: string, options: UploadStreamOptions) => {
    for (const line of lines) {
      options.onLine(line);
    }
    return Promise.resolve();
  });
  const http: HttpClient = { request: vi.fn(), send: vi.fn(), stream };
  return { api: createApi(http), stream };
}

describe('visits.process', () => {
  const audio = new Blob(['audio bytes'], { type: 'audio/webm' });

  it('uploads the recording and its length as a multipart form', async () => {
    const { api, stream } = clientAnswering();

    await api.visits.process(
      VISIT_ID,
      { audio, fileName: 'recording.webm', durationSec: 42 },
      { onEvent: vi.fn() },
    );

    const [path, options] = stream.mock.calls[0] ?? [];
    expect(path).toBe(`/v1/visits/${VISIT_ID}/process`);
    expect(options?.body.get('durationSec')).toBe('42');
    expect(options?.body.has('replaceExisting')).toBe(false);

    const part = options?.body.get('audio');
    expect(part).toBeInstanceOf(File);
    expect(part).toMatchObject({ name: 'recording.webm', type: 'audio/webm', size: audio.size });
  });

  it('asks to replace an existing note only when told to', async () => {
    const { api, stream } = clientAnswering();

    await api.visits.process(
      VISIT_ID,
      { audio, fileName: 'recording.webm', durationSec: 42, replaceExisting: true },
      { onEvent: vi.fn() },
    );

    expect(stream.mock.calls[0]?.[1].body.get('replaceExisting')).toBe('true');
  });

  it('passes on each event of the run, in order', async () => {
    const events: ProcessEvent[] = [
      { type: 'stage', stage: 'transcribing' },
      { type: 'transcript', transcript: [{ speaker: 'Clinician', text: 'Good morning.' }] },
      { type: 'stage', stage: 'drafting' },
      { type: 'note', note: { subjective: 'Sore throat.' } },
      { type: 'error', error: { code: 'AI_UNAVAILABLE', message: 'Please try again.' } },
    ];
    const { api } = clientAnswering(...events);
    const onEvent = vi.fn();

    await api.visits.process(
      VISIT_ID,
      { audio, fileName: 'recording.webm', durationSec: 42 },
      { onEvent },
    );

    expect(onEvent.mock.calls.map(([event]) => event as ProcessEvent)).toEqual(events);
  });

  it('refuses a line that is not one of the known events', () => {
    const { api } = clientAnswering({ type: 'mystery' });
    const onEvent = vi.fn();

    expect(() =>
      api.visits.process(
        VISIT_ID,
        { audio, fileName: 'recording.webm', durationSec: 42 },
        { onEvent },
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(onEvent).not.toHaveBeenCalled();
  });
});
