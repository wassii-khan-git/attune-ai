import { invalidResponse, networkError, toApiError } from './errors';
import { createLineReader } from './ndjson';

export type UploadStreamOptions = {
  /** Sent as multipart form data. The browser adds the content type and its boundary. */
  body: FormData;
  signal?: AbortSignal;
  /** Called while the body leaves the browser, with the share sent so far, from 0 to 1. */
  onUploadProgress?: (fraction: number) => void;
  /** Called once per line of the response, with that line parsed as JSON. */
  onLine: (value: unknown) => void;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function cancelled(): DOMException {
  return new DOMException('The upload was cancelled.', 'AbortError');
}

/**
 * Uploads a form and reads a newline-delimited JSON response line by line
 * while it is still arriving. Resolves when the response has ended.
 *
 * This is the one request that does not use `fetch`: `fetch` cannot report
 * how much of a request body has been sent, and a recording on a slow
 * connection needs a real progress bar. `XMLHttpRequest` reports upload
 * progress in every browser and also exposes the response as it grows.
 *
 * A refusal (any status outside 2xx) is a single JSON error body, not a
 * stream. It rejects with the same `ApiError` every other call produces.
 */
export function uploadStream(
  xhr: XMLHttpRequest,
  path: string,
  { body, signal, onUploadProgress, onLine }: UploadStreamOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const lines = createLineReader();
    let consumed = 0;
    let settled = false;

    const settle = (error?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (error === undefined) {
        resolve();
      } else {
        reject(error instanceof Error ? error : invalidResponse(xhr.status));
      }
    };

    /** For a failure found while the response is still arriving: nothing after it is wanted. */
    const stop = (error: unknown): void => {
      settle(error);
      xhr.abort();
    };

    const deliver = (ready: string[]): void => {
      for (const line of ready) {
        if (settled) {
          return;
        }
        const value = parseJson(line);
        if (value === undefined) {
          stop(invalidResponse(xhr.status));
          return;
        }
        try {
          onLine(value);
        } catch (error) {
          stop(error);
        }
      }
    };

    const isSuccess = (): boolean => xhr.status >= 200 && xhr.status < 300;

    const readNewText = (): void => {
      if (!settled && isSuccess()) {
        const text = xhr.responseText;
        deliver(lines.push(text.slice(consumed)));
        consumed = text.length;
      }
    };

    xhr.open('POST', path);
    xhr.responseType = 'text';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress?.(event.loaded / event.total);
      }
    };
    xhr.upload.onload = () => {
      onUploadProgress?.(1);
    };

    xhr.onprogress = readNewText;
    xhr.onload = () => {
      if (!isSuccess()) {
        const refusal = parseJson(xhr.responseText);
        settle(toApiError(xhr.status, refusal, xhr.getResponseHeader('Retry-After')));
        return;
      }
      readNewText();
      deliver(lines.flush());
      settle();
    };
    xhr.onerror = () => {
      settle(networkError());
    };
    xhr.onabort = () => {
      settle(cancelled());
    };

    if (signal?.aborted === true) {
      settle(cancelled());
      return;
    }
    signal?.addEventListener(
      'abort',
      () => {
        xhr.abort();
      },
      { once: true },
    );

    xhr.send(body);
  });
}
