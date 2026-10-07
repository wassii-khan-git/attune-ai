type Handler<Event = undefined> = ((event: Event) => void) | null;
type UploadProgress = { lengthComputable: boolean; loaded: number; total: number };

/**
 * The part of `XMLHttpRequest` that an upload uses, moved along by hand from a
 * test. Tests run outside a browser, where the real one does not exist.
 */
export class FakeXhr {
  method = '';
  url = '';
  body: unknown = null;
  aborted = false;

  status = 0;
  responseText = '';
  responseType = '';

  readonly upload: { onprogress: Handler<UploadProgress>; onload: Handler } = {
    onprogress: null,
    onload: null,
  };
  onprogress: Handler = null;
  onload: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;

  private readonly headers = new Map<string, string>();

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  send(body: unknown): void {
    this.body = body;
  }

  abort(): void {
    if (!this.aborted) {
      this.aborted = true;
      this.onabort?.(undefined);
    }
  }

  getResponseHeader(name: string): string | null {
    return this.headers.get(name.toLowerCase()) ?? null;
  }

  /** The browser reports that this much of the body has been sent. */
  uploaded(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }

  uploadFinished(): void {
    this.upload.onload?.(undefined);
  }

  /** The status line and headers arrive. */
  respond(status: number, headers: Record<string, string> = {}): void {
    this.status = status;
    for (const [name, value] of Object.entries(headers)) {
      this.headers.set(name.toLowerCase(), value);
    }
  }

  /** A piece of the response body arrives. */
  receive(text: string): void {
    this.responseText += text;
    this.onprogress?.(undefined);
  }

  /** The response is complete. */
  end(): void {
    this.onload?.(undefined);
  }

  /** The connection fails. */
  drop(): void {
    this.onerror?.(undefined);
  }

  asXhr(): XMLHttpRequest {
    return this as unknown as XMLHttpRequest;
  }
}

/** Hands out the given requests in order, one per upload attempt. */
export function fakeXhrFactory(...requests: FakeXhr[]): () => XMLHttpRequest {
  return () => {
    const next = requests.shift();
    if (next === undefined) {
      throw new Error('fakeXhrFactory ran out of requests');
    }
    return next.asXhr();
  };
}
