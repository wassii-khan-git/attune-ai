import type { z } from 'zod';

import { invalidResponse, isApiError, networkError, toApiError } from './errors';
import { uploadStream, type UploadStreamOptions } from './upload-stream';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Query = Record<string, string | number | undefined>;

export type RequestOptions = {
  method?: Method;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /**
   * Whether a 401 should trigger one session refresh and a retry. Off for the
   * sign-in endpoints themselves, where a 401 is the answer, not a stale session.
   */
  retryOnUnauthenticated?: boolean;
};

export type HttpClient = {
  /** Sends the request and validates the response body against `schema`. */
  request: <S extends z.ZodType>(
    path: string,
    schema: S,
    options?: RequestOptions,
  ) => Promise<z.output<S>>;
  /** For endpoints that answer 204 with no body. */
  send: (path: string, options?: RequestOptions) => Promise<void>;
  /**
   * Uploads a form with `POST` and hands over the response one line at a time
   * while it is still arriving. Resolves when the response has ended.
   */
  stream: (path: string, options: UploadStreamOptions) => Promise<void>;
};

export type HttpClientOptions = {
  fetch?: typeof globalThis.fetch;
  /** Makes the request object for an upload. Replaced in tests, which run outside a browser. */
  createXhr?: () => XMLHttpRequest;
  /** Tries to renew the session. Resolves to true if the request is worth repeating. */
  onUnauthenticated?: () => Promise<boolean>;
};

function buildUrl(path: string, query: Query | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
}

async function refusal(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => undefined);
  return toApiError(response.status, body, response.headers.get('Retry-After'));
}

/**
 * The one place the browser talks to the API from. Paths are same-origin
 * (`/v1/...`); the site forwards them, so cookies travel without any
 * cross-origin setup and no token is ever handled by this code.
 *
 * Responses are validated against the shared schemas, so a contract change
 * surfaces here as one clear error and not as `undefined` deep inside a page.
 */
export function createHttpClient({
  fetch = globalThis.fetch,
  createXhr = () => new XMLHttpRequest(),
  onUnauthenticated,
}: HttpClientOptions = {}): HttpClient {
  async function perform(
    path: string,
    options: RequestOptions,
    isRetry: boolean,
  ): Promise<Response> {
    const { method = 'GET', body, query, signal, retryOnUnauthenticated = true } = options;

    let response: Response;
    try {
      response = await fetch(buildUrl(path, query), {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      throw networkError();
    }

    const canRetry = response.status === 401 && retryOnUnauthenticated && !isRetry;
    if (canRetry && onUnauthenticated !== undefined && (await onUnauthenticated())) {
      return perform(path, options, true);
    }
    if (!response.ok) {
      throw await refusal(response);
    }
    return response;
  }

  return {
    request: async (path, schema, options = {}) => {
      const response = await perform(path, options, false);
      const body: unknown = await response.json().catch(() => undefined);
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw invalidResponse(response.status);
      }
      return parsed.data;
    },

    send: async (path, options = {}) => {
      await perform(path, options, false);
    },

    stream: async (path, options) => {
      try {
        await uploadStream(createXhr(), path, options);
      } catch (error) {
        // An expired session is refused before any line is sent, so the upload can simply be repeated.
        const expired = isApiError(error) && error.status === 401;
        if (!expired || onUnauthenticated === undefined || !(await onUnauthenticated())) {
          throw error;
        }
        await uploadStream(createXhr(), path, options);
      }
    },
  };
}
