import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './errors';
import { FakeXhr } from './testing';
import { uploadStream } from './upload-stream';

function start(xhr: FakeXhr, signal?: AbortSignal) {
  const onLine = vi.fn<(value: unknown) => void>();
  const onUploadProgress = vi.fn<(fraction: number) => void>();
  const body = new FormData();
  const finished = uploadStream(xhr.asXhr(), '/v1/visits/1/process', {
    body,
    onLine,
    onUploadProgress,
    ...(signal === undefined ? {} : { signal }),
  });
  return { finished, onLine, onUploadProgress, body };
}

describe('upload stream', () => {
  it('posts the form to the given path', async () => {
    const xhr = new FakeXhr();
    const { finished, body } = start(xhr);
    xhr.respond(200);
    xhr.end();
    await finished;

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/v1/visits/1/process');
    expect(xhr.body).toBe(body);
  });

  it('reports how much of the body has been sent', async () => {
    const xhr = new FakeXhr();
    const { finished, onUploadProgress } = start(xhr);

    xhr.uploaded(250, 1000);
    xhr.uploaded(1000, 1000);
    xhr.uploadFinished();
    xhr.respond(200);
    xhr.end();
    await finished;

    expect(onUploadProgress.mock.calls.map(([fraction]) => fraction)).toEqual([0.25, 1, 1]);
  });

  it('hands over each line as soon as it is complete', async () => {
    const xhr = new FakeXhr();
    const { finished, onLine } = start(xhr);
    xhr.respond(200);

    xhr.receive('{"type":"stage","stage":"transcribing"}\n{"type":"sta');
    expect(onLine).toHaveBeenCalledTimes(1);

    xhr.receive('ge","stage":"drafting"}\n');
    expect(onLine).toHaveBeenCalledTimes(2);

    xhr.receive('{"type":"done"}');
    xhr.end();
    await finished;

    expect(onLine.mock.calls.map(([line]) => line)).toEqual([
      { type: 'stage', stage: 'transcribing' },
      { type: 'stage', stage: 'drafting' },
      { type: 'done' },
    ]);
  });

  it('rejects a refusal with the error the API sent, and reads no lines from it', async () => {
    const xhr = new FakeXhr();
    const { finished, onLine } = start(xhr);
    xhr.respond(429, { 'Retry-After': '120' });
    xhr.receive('{"error":{"code":"QUOTA_EXCEEDED","message":"Limit reached."}}');
    xhr.end();

    await expect(finished).rejects.toMatchObject({
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message: 'Limit reached.',
      retryAfterSec: 120,
    });
    expect(onLine).not.toHaveBeenCalled();
  });

  it('rejects a refusal that is not in the API error shape as an invalid response', async () => {
    const xhr = new FakeXhr();
    const { finished } = start(xhr);
    xhr.respond(502);
    xhr.receive('<html>Bad gateway</html>');
    xhr.end();

    await expect(finished).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });

  it('rejects with a network error when the connection fails, even mid-stream', async () => {
    const xhr = new FakeXhr();
    const { finished, onLine } = start(xhr);
    xhr.respond(200);
    xhr.receive('{"type":"stage","stage":"transcribing"}\n');
    xhr.drop();

    await expect(finished).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(onLine).toHaveBeenCalledTimes(1);
  });

  it('stops at a line that is not JSON', async () => {
    const xhr = new FakeXhr();
    const { finished, onLine } = start(xhr);
    xhr.respond(200);
    xhr.receive('{"type":"stage"}\nnot json\n{"type":"done"}\n');

    await expect(finished).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(onLine).toHaveBeenCalledTimes(1);
    expect(xhr.aborted).toBe(true);
  });

  it('stops and rejects with the error a line handler throws', async () => {
    const xhr = new FakeXhr();
    const { finished, onLine } = start(xhr);
    const refused = new ApiError(200, 'INVALID_RESPONSE', 'Unknown event.');
    onLine.mockImplementationOnce(() => {
      throw refused;
    });
    xhr.respond(200);
    xhr.receive('{"type":"mystery"}\n{"type":"done"}\n');

    await expect(finished).rejects.toBe(refused);
    expect(onLine).toHaveBeenCalledTimes(1);
    expect(xhr.aborted).toBe(true);
  });

  it('cancels the request when the signal aborts', async () => {
    const xhr = new FakeXhr();
    const controller = new AbortController();
    const { finished } = start(xhr, controller.signal);

    controller.abort();

    await expect(finished).rejects.toMatchObject({ name: 'AbortError' });
    expect(xhr.aborted).toBe(true);
  });

  it('sends nothing when the signal has already aborted', async () => {
    const xhr = new FakeXhr();
    const controller = new AbortController();
    controller.abort();
    const { finished } = start(xhr, controller.signal);

    await expect(finished).rejects.toMatchObject({ name: 'AbortError' });
    expect(xhr.body).toBeNull();
  });
});
