# Progress

## Done

- Phase 1, Step 1.1: monorepo scaffold (pnpm + Turborepo, `apps/api`, `packages/shared`, root ESLint/Prettier/tsconfig, validated config, `/health` and `/ready`, ADR 0001 and 0002)
- Phase 1, Step 1.2: database schema (Prisma 7 on Neon, five models, first migration applied, AES-256-GCM field cipher with tests, `/ready` checks the database)
- Phase 1, Step 1.4: security baseline (helmet, CORS allowlist, pino logger with redaction, request ids, error envelope, audit service). Done before 1.3 because auth depends on it.
- Phase 1, Step 1.3: auth (register, login, guest, refresh with rotation, logout, `GET /v1/auth/me`, Postgres-backed rate limiting)

- Phase 1, Step 1.5: visits (create, list with title search and cursor pagination, get, replace note, delete) and account deletion

## Next

- Phase 1, Step 1.6: AI pipeline

## Notes / decisions

### Tooling

- TypeScript is pinned to 6.0.x because typescript-eslint 8 does not support TypeScript 7 yet.
- `packages/shared` is compiled and apps import its `dist`. Use the root scripts so Turborepo builds it (and generates the Prisma client) first.
- pnpm blocks dependency install scripts (`allowBuilds`) and applies a release-age cooldown. If install rejects a fresh release, lower the version range; do not add an exclusion.
- ESLint enforces the API layering and bans `console`. Only `src/repositories` may import the Prisma client or `pg`.

### Config

- `apps/api/src/config/env.ts` validates every variable; a test fails if `.env.example` drifts from it. `DIRECT_URL` is in `.env.example` only (Prisma CLI, not the running API).

### Database

- Prisma, `@prisma/client` and `@prisma/adapter-pg` are pinned to exactly 7.10.0 and must move together. npm's `latest` tag for `prisma` currently points at an 8.0 release candidate; do not follow it.
- The client is generated into `apps/api/src/generated` (git-ignored) by the Turborepo `generate` task. Run `pnpm --filter api generate` after editing the schema.
- The API connects with node-postgres (`@prisma/adapter-pg`), so the same code runs against Neon's pooled URL and the plain Postgres container CI will use. Migrations use `DIRECT_URL` via `apps/api/prisma.config.ts`.
- Guests have no email or password hash. A CHECK constraint (`users_credentials_check`, written by hand in the first migration and invisible in `schema.prisma`) requires both for every other account.
- `audit_events` holds only UUIDs, enums and a timestamp, and has no foreign key to `users`, so rows survive account deletion. New actions are added to the `AuditAction` enum by migration.
- Field encryption: `src/lib/field-cipher.ts`. Build it once with `createFieldCipher(Buffer.from(config.ENCRYPTION_KEY, 'base64'))` and pass a context such as `visit:<id>:note` to every call. It is not wired to any route yet (step 1.5).
- A fresh connection from the dev machine to Neon (us-east-2) takes about 2 s, so the readiness timeout is 5 s. For step 1.7: place the Vercel function region next to the database.

### HTTP, logging and errors

- Middleware order in `src/app.ts`: request context, helmet, CORS, JSON parser, routes, 404, error handler. New routers mount under `/v1` before the 404 handler.
- Throw `AppError(status, code, message)` for expected failures and let Zod errors propagate; `src/middleware/error-handler.ts` turns both into `{ error: { code, message, details? } }`. Add new codes to `errorCodeSchema` in `packages/shared`.
- Log through `req.log` (bound to the request id), never the root logger and never `console`. Request lines hold method, path, status and duration only. `src/lib/logger.ts` redacts sensitive keys and strips extra properties from errors; add any new sensitive key to `SENSITIVE_KEYS`.
- `AuditService.record` rejects when the row cannot be written, and callers let that fail the request.
- Tests build the real app with `createTestApp()` from `src/testing`, which also captures log output.

### Auth

- Access tokens are 15-minute HS256 JWTs (`jose`), verified without a database call, so a deleted account's token still passes `authenticate` until it expires. Handlers that must not serve a deleted account load the user.
- Refresh tokens are random, stored as a SHA-256, valid 7 days (guests: until 24 h after the account was created) and rotated on every use. Replaying a retired token revokes every session of that user.
- Browsers get `attune_access` (path `/`) and `attune_refresh` (path `/v1/auth`) as httpOnly, SameSite=Lax cookies. Native clients send `X-Token-Transport: body` and get the tokens in the response; that header is ignored whenever an `Origin` header is present.
- Protect a route with the `requireUser` middleware built in `src/app.ts` and read the caller with `requireAuth(req)`.
- Passwords use bcrypt cost 12 through `bcryptjs` (pure JavaScript, no native build). Length 10 to 72; bcrypt ignores input past 72 bytes.
- Rate limits (per client address, fixed window, counters in `rate_limit_buckets`): register and login 10 per 5 min, refresh and logout 60 per 5 min, guest 5 per hour.

### Visits

- Routes: `POST /v1/visits`, `GET /v1/visits?q=&cursor=&limit=`, `GET /v1/visits/:id`, `PUT /v1/visits/:id/note`, `DELETE /v1/visits/:id`, `DELETE /v1/account`.
- Ownership is part of every query (`where: { id, userId }`). Another user's visit answers 404, the same as a missing one. `DELETE` always answers 204 and only audits when a row was removed.
- Only `GET /v1/visits/:id` decrypts, and it writes a `VISIT_VIEWED` audit row. Lists select no encrypted columns.
- Transcript and note are stored as encrypted JSON. Always build the context with `visitFieldContext(visitId, 'transcript' | 'note')`.
- `PUT .../note` answers 409 while the status is `PROCESSING`, so the generation step cannot overwrite an edit unnoticed. Step 1.6 must set `PROCESSING` before it starts and `READY` or `FAILED` when it ends.
- `soapNoteSchema` and `transcriptSchema` live in `packages/shared`. The speaker label is a free string for now; step 1.6 may narrow it.
- Consent is given at creation (`consentGiven: true`) and timestamped by the server.

### Testing

- API tests run the real app on the in-memory repositories in `src/testing`. Nothing automated exercises the Prisma repositories yet: they were checked by hand against Neon, which is how the unescaped LIKE wildcard in title search was found. Step 1.7 should add integration tests for the repositories, including that search.

### To carry into later steps

- Step 1.8 (threat model): account deletion does not ask for the password again; registration reveals whether an email is taken; rate limits are per address only.

- Step 1.7: set `TRUST_PROXY_HOPS=1` on Vercel, otherwise every visitor shares one rate-limit bucket. Have the retention cron also delete `rate_limit_buckets` rows older than a day and expired `refresh_tokens`.
- Step 2.1: the web app must call the API through a same-origin proxy that keeps the `/v1/...` paths (a Next.js rewrite). Two `*.vercel.app` hosts are different sites, so SameSite cookies would not be sent between them, and the refresh cookie is scoped to `/v1/auth`.
- Step 2.1: run one refresh at a time across tabs (for example with the Web Locks API). Two tabs refreshing with the same cookie look like a replay and sign the user out.
