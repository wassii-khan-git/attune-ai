import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from './errors';
import { createHttpClient } from './http';
import { FakeXhr, fakeXhrFactory } from './testing';

const schema = z.object({ id: z.string() });

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A fetch that answers with the given responses in order and records what it was asked. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) {
      throw new Error('fakeFetch ran out of responses');
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the request to fail');
}

describe('http client', () => {
  it('returns the response body, validated against the schema', async () => {
    const { fetch } = fakeFetch(json(200, { id: 'v1', ignored: true }));

    await expect(createHttpClient({ fetch }).request('/v1/x', schema)).resolves.toEqual({
      id: 'v1',
    });
  });

  it('sends JSON with same-origin credentials and no caching', async () => {
    const { fetch, calls } = fakeFetch(json(200, { id: 'v1' }));

    await createHttpClient({ fetch }).request('/v1/x', schema, { method: 'POST', body: { a: 1 } });

    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
  });

  it('builds the query string and leaves out empty values', async () => {
    const { fetch, calls } = fakeFetch(json(200, { id: 'v1' }));

    await createHttpClient({ fetch }).request('/v1/visits', schema, {
      query: { q: 'knee pain', cursor: undefined, limit: 20, empty: '' },
    });

    expect(calls[0]?.url).toBe('/v1/visits?q=knee+pain&limit=20');
  });

  it("turns the API's error envelope into an ApiError with its code and field details", async () => {
    const { fetch } = fakeFetch(
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request is not valid.',
          details: [{ path: 'email', message: 'Invalid email' }],
        },
      }),
    );

    const error = await failure(createHttpClient({ fetch }).request('/v1/x', schema));

    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The request is not valid.',
      details: [{ path: 'email', message: 'Invalid email' }],
    });
  });

  it('reads how long to wait from a throttled response', async () => {
    const { fetch } = fakeFetch(
      json(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
        { 'Retry-After': '42' },
      ),
    );

    const error = await failure(createHttpClient({ fetch }).request('/v1/x', schema));

    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSec: 42 });
  });

  it('reports a response that does not match the contract, without throwing a raw parse error', async () => {
    const { fetch } = fakeFetch(json(200, { unexpected: true }));

    const error = await failure(createHttpClient({ fetch }).request('/v1/x', schema));

    expect(error).toMatchObject({ status: 200, code: 'INVALID_RESPONSE' });
  });

  it("reports an error page that is not the API's envelope", async () => {
    const { fetch } = fakeFetch(new Response('<html>Bad gateway</html>', { status: 502 }));

    const error = await failure(createHttpClient({ fetch }).request('/v1/x', schema));

    expect(error).toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });

  it('reports a request that never got an answer', async () => {
    const { fetch } = fakeFetch(new TypeError('Failed to fetch'));

    const error = await failure(createHttpClient({ fetch }).request('/v1/x', schema));

    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('lets a deliberate abort through as an abort, not as a network error', async () => {
    const { fetch } = fakeFetch(new DOMException('Aborted', 'AbortError'));

    await expect(createHttpClient({ fetch }).request('/v1/x', schema)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('accepts an empty 204 answer', async () => {
    const { fetch } = fakeFetch(new Response(null, { status: 204 }));

    await expect(
      createHttpClient({ fetch }).send('/v1/x', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });
});

describe('http client and an expired session', () => {
  const unauthenticated = () =>
    json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });

  it('renews the session once and repeats the request', async () => {
    const { fetch, calls } = fakeFetch(unauthenticated(), json(200, { id: 'v1' }));
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));

    const result = await createHttpClient({ fetch, onUnauthenticated }).request('/v1/x', schema);

    expect(result).toEqual({ id: 'v1' });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('does not loop when the repeated request is refused too', async () => {
    const { fetch, calls } = fakeFetch(unauthenticated(), unauthenticated());
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));

    const error = await failure(
      createHttpClient({ fetch, onUnauthenticated }).request('/v1/x', schema),
    );

    expect(error.code).toBe('UNAUTHENTICATED');
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('gives up when the session cannot be renewed', async () => {
    const { fetch, calls } = fakeFetch(unauthenticated());

    const error = await failure(
      createHttpClient({ fetch, onUnauthenticated: () => Promise.resolve(false) }).request(
        '/v1/x',
        schema,
      ),
    );

    expect(error.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('never renews for a request that opted out, such as sign-in itself', async () => {
    const { fetch } = fakeFetch(
      json(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
      }),
    );
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));

    const error = await failure(
      createHttpClient({ fetch, onUnauthenticated }).request('/v1/auth/login', schema, {
        method: 'POST',
        retryOnUnauthenticated: false,
      }),
    );

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});

describe('http client and a streamed upload', () => {
  const refuse = (xhr: FakeXhr) => {
    xhr.respond(401);
    xhr.receive('{"error":{"code":"UNAUTHENTICATED","message":"Sign in to continue."}}');
    xhr.end();
  };

  it('renews an expired session once and uploads again', async () => {
    const first = new FakeXhr();
    const second = new FakeXhr();
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));
    const onLine = vi.fn();
    const body = new FormData();

    const finished = createHttpClient({
      createXhr: fakeXhrFactory(first, second),
      onUnauthenticated,
    }).stream('/v1/x', { body, onLine });

    refuse(first);
    await vi.waitFor(() => {
      expect(second.body).toBe(body);
    });
    second.respond(200);
    second.receive('{"type":"done"}\n');
    second.end();
    await finished;

    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(onLine).toHaveBeenCalledExactlyOnceWith({ type: 'done' });
  });

  it('gives up when the session cannot be renewed', async () => {
    const xhr = new FakeXhr();
    const finished = createHttpClient({
      createXhr: fakeXhrFactory(xhr),
      onUnauthenticated: () => Promise.resolve(false),
    }).stream('/v1/x', { body: new FormData(), onLine: vi.fn() });

    refuse(xhr);

    expect(await failure(finished)).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('does not renew the session for any other refusal', async () => {
    const xhr = new FakeXhr();
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));
    const finished = createHttpClient({
      createXhr: fakeXhrFactory(xhr),
      onUnauthenticated,
    }).stream('/v1/x', { body: new FormData(), onLine: vi.fn() });

    xhr.respond(409);
    xhr.receive('{"error":{"code":"NOTE_EXISTS","message":"This visit already has a note."}}');
    xhr.end();

    expect(await failure(finished)).toMatchObject({ status: 409, code: 'NOTE_EXISTS' });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});
