import {
  authResponseSchema,
  listVisitsResponseSchema,
  meResponseSchema,
  sessionResponseSchema,
  visitDetailResponseSchema,
  visitResponseSchema,
  type CreateVisitRequest,
  type LoginRequest,
  type RegisterRequest,
  type SoapNote,
} from '@attune/shared';

import type { HttpClient } from './http';

/** What a caller may pass to the visit list. The server applies its own defaults and limits. */
export type VisitListParams = {
  q?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
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
    },

    account: {
      remove: () => http.send('/v1/account', { method: 'DELETE' }),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
