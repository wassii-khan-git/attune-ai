import {
  AUDIO_FIELD_NAME,
  authResponseSchema,
  listVisitsResponseSchema,
  meResponseSchema,
  processEventSchema,
  sessionResponseSchema,
  visitDetailResponseSchema,
  visitResponseSchema,
  type CreateVisitRequest,
  type LoginRequest,
  type ProcessEvent,
  type RegisterRequest,
  type SoapNote,
} from '@attune/shared';

import { invalidResponse } from './errors';
import type { HttpClient } from './http';

/** What a caller may pass to the visit list. The server applies its own defaults and limits. */
export type VisitListParams = {
  q?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
};

export type ProcessVisitInput = {
  audio: Blob;
  /** Names the uploaded part. The server keeps neither the name nor the audio. */
  fileName: string;
  /** Length of the recording in whole seconds, as measured in the browser. */
  durationSec: number;
  /** Set only after the user agreed to replace the note this visit already has. */
  replaceExisting?: boolean;
};

export type ProcessVisitHandlers = {
  /** Called for each event of the run, in order. The last one is `done` or `error`. */
  onEvent: (event: ProcessEvent) => void;
  /** Called while the recording uploads, with the share sent so far, from 0 to 1. */
  onUploadProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

const AUTH = '/v1/auth';
const VISITS = '/v1/visits';

/** A 401 from these means "wrong credentials" or "no session", so it is never retried. */
const noRetry = { retryOnUnauthenticated: false } as const;

/**
 * One function per endpoint. Request types and response schemas both come from
 * `@attune/shared`, the same definitions the API validates with.
 */
export function createApi(http: HttpClient) {
  return {
    auth: {
      register: (input: RegisterRequest) =>
        http.request(`${AUTH}/register`, authResponseSchema, {
          method: 'POST',
          body: input,
          ...noRetry,
        }),
      login: (input: LoginRequest) =>
        http.request(`${AUTH}/login`, authResponseSchema, {
          method: 'POST',
          body: input,
          ...noRetry,
        }),
      guest: () =>
        http.request(`${AUTH}/guest`, authResponseSchema, { method: 'POST', ...noRetry }),
      refresh: () =>
        http.request(`${AUTH}/refresh`, authResponseSchema, { method: 'POST', ...noRetry }),
      logout: () => http.send(`${AUTH}/logout`, { method: 'POST', ...noRetry }),
      /** Who is signed in, if anyone. Never fails with a 401, so it is safe to call on every page load. */
      session: (signal?: AbortSignal) =>
        http.request(`${AUTH}/session`, sessionResponseSchema, {
          ...noRetry,
          ...(signal === undefined ? {} : { signal }),
        }),
      me: (signal?: AbortSignal) =>
        http.request(`${AUTH}/me`, meResponseSchema, signal === undefined ? {} : { signal }),
    },

    visits: {
      create: (input: CreateVisitRequest) =>
        http.request(VISITS, visitResponseSchema, { method: 'POST', body: input }),
      list: (query: VisitListParams = {}, signal?: AbortSignal) =>
        http.request(VISITS, listVisitsResponseSchema, {
          query: { q: query.q, cursor: query.cursor, limit: query.limit },
          ...(signal === undefined ? {} : { signal }),
        }),
      get: (id: string, signal?: AbortSignal) =>
        http.request(
          `${VISITS}/${encodeURIComponent(id)}`,
          visitDetailResponseSchema,
          signal === undefined ? {} : { signal },
        ),
      updateNote: (id: string, note: SoapNote) =>
        http.request(`${VISITS}/${encodeURIComponent(id)}/note`, visitResponseSchema, {
          method: 'PUT',
          body: { note },
        }),
      remove: (id: string) =>
        http.send(`${VISITS}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      /**
       * Uploads a recording and follows the transcription and the note as they
       * are produced. A refusal rejects like any other call; once the run has
       * started, a failure arrives as its last event instead.
       */
      process: (id: string, input: ProcessVisitInput, handlers: ProcessVisitHandlers) => {
        const body = new FormData();
        body.append('durationSec', String(input.durationSec));
        if (input.replaceExisting === true) {
          body.append('replaceExisting', 'true');
        }
        body.append(AUDIO_FIELD_NAME, input.audio, input.fileName);

        return http.stream(`${VISITS}/${encodeURIComponent(id)}/process`, {
          body,
          onLine: (line) => {
            const event = processEventSchema.safeParse(line);
            if (!event.success) {
              throw invalidResponse(200);
            }
            handlers.onEvent(event.data);
          },
          ...(handlers.onUploadProgress === undefined
            ? {}
            : { onUploadProgress: handlers.onUploadProgress }),
          ...(handlers.signal === undefined ? {} : { signal: handlers.signal }),
        });
      },
    },

    account: {
      remove: () => http.send('/v1/account', { method: 'DELETE' }),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
