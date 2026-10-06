# Progress

## Done

- Phase 1, Step 1.1: monorepo scaffold (pnpm + Turborepo, `apps/api`, `packages/shared`, root ESLint/Prettier/tsconfig, validated config, `/health` and `/ready`, ADR 0001 and 0002)
- Phase 1, Step 1.2: database schema (Prisma 7 on Neon, five models, first migration applied, AES-256-GCM field cipher with tests, `/ready` checks the database)
- Phase 1, Step 1.4: security baseline (helmet, CORS allowlist, pino logger with redaction, request ids, error envelope, audit service). Done before 1.3 because auth depends on it.
- Phase 1, Step 1.3: auth (register, login, guest, refresh with rotation, logout, `GET /v1/auth/me`, Postgres-backed rate limiting)

- Phase 1, Step 1.5: visits (create, list with title search and cursor pagination, get, replace note, delete) and account deletion

- Phase 1, Step 1.6: AI pipeline (`POST /v1/visits/:id/process`: audio upload, Gemini transcription and note drafting, NDJSON stream, daily quota, timeout and one retry, ADR 0003)

- Phase 1, Step 1.6b: AI evaluation (`pnpm eval`: five synthetic transcripts in `apps/api/eval`, checked for required facts, invented claims and "Not discussed" sections)

- Phase 1, Step 1.7: docs, retention and CI (OpenAPI at `/docs` and `/openapi.json`, retention cron endpoint, `apps/api/vercel.json`, GitHub Actions for lint, typecheck, coverage, integration tests and audit, Dependabot, CodeQL)

## Next

- Phase 1, Step 1.8: review and threat model (findings need the owner's approval before any fix)

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

### AI pipeline

- Protocol: multipart upload (field `audio`, optional `durationSec`), then `application/x-ndjson` events validated by `processEventSchema` in `packages/shared`. Refusals before the stream use normal status codes; after it starts, read the last event (`done` or `error`).
- Only `src/ai` may import `ai` or `@ai-sdk/*` (lint). Everything else depends on the `ScribeModel` interface; tests use `createFakeScribeModel()`.
- Prompts are in `src/ai/prompts.ts` with a version each. Bump the version when the text changes; it is logged with every run.
- AI SDK 7: structured output is `generateText` / `streamText` with `Output.object`. Always pass `onError` to `streamText`, or the SDK prints the error, which contains the request body, to the console.
- Quota: 10 generations per UTC day, 3 for guests. A run counts when it starts and is not refunded if it fails.
- The audio type is detected from the file's bytes (`src/lib/audio-format.ts`), not from the client's header. A real run with AAC in an MP4 container worked. WebM/Opus from Chrome's `MediaRecorder` has not been tried against Gemini: check it in step 2.3 and record in another container if it is refused.
- On 2026-10-06 `gemini-3.8-flash` and `gemini-3.5-flash` answered 503 "high demand" even for a one-line prompt, while `gemini-3.5-flash-lite` completed the full pipeline in about 9 s for a 31 s recording. `GEMINI_MODEL` in `.env` is the owner's choice and was left unchanged.

- `pnpm eval` calls the live model (five requests) and is not part of CI. It evaluates note drafting only, because transcription needs audio. Checks are plain pattern matches in `eval/cases.ts`; run it after any prompt or model change. Result on 2026-10-06 with `note-v1`: 5/5 on `gemini-3.5-flash-lite`; `gemini-3.8-flash` could not be evaluated (503 on every case).

### API docs and retention

- `src/openapi/document.ts` lists every public operation and takes its schemas from `packages/shared`. Add an entry there for each new route; a test calls every documented route to prove it exists.
- `/docs` loads Swagger UI from jsDelivr at a pinned version with integrity hashes and has its own content security policy. Recompute both hashes when changing the version.
- `GET /internal/cron/retention` needs `Authorization: Bearer <CRON_SECRET>` and answers 404 without it. It deletes guests older than 24 h, expired refresh tokens and day-old rate-limit counters, and is safe to run twice.
- On Vercel's Hobby plan a cron runs once a day at some point within its hour, so a guest account can live up to about 48 h before it is deleted, although its session ends at 24 h. Describe it that way in the README.

### Testing and CI

- `pnpm test`: unit and API tests on the in-memory repositories in `src/testing`. `pnpm test:coverage` enforces 80% on `apps/api/src/services`.
- `pnpm test:integration`: the Prisma repositories and one full API flow against a real PostgreSQL. It needs `TEST_DATABASE_URL`, which is deliberately not `DATABASE_URL`. Tests create and delete their own rows and never truncate.
- CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, coverage, integration tests on a `postgres:18` service, and `pnpm audit --prod --audit-level high`. Actions are pinned to commits. The workflows have not run yet: check the first run after pushing.
- CodeQL and Dependabot are configured in `.github`. Code scanning and Dependabot alerts also have to be switched on in the repository settings on GitHub.

### Deploying the API to Vercel (owner's steps)

- Create a Vercel project with Root Directory `apps/api`. `src/server.ts` is the entry point Vercel detects; the app factory lives in `src/create-app.ts` so that no second candidate exists.
- Set every variable from `.env.example` in the project settings, with `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, and `CORS_ALLOWED_ORIGINS` set to the web app's URL.
- `vercel.json` builds the shared package, generates the Prisma client and runs `prisma migrate deploy` on every build, so `DIRECT_URL` must be set too. Preview builds migrate whichever database their variables point to.
- `vercel.json` pins the function to `cle1` (Ohio), next to the Neon database in us-east-2. The build command and region are untested until the first deploy.
- Model calls are bounded to fit the 300 s request limit: 75 s for transcription and 45 s for the note, each with one retry.

### To carry into later steps

- Step 1.8 (threat model): account deletion does not ask for the password again; registration reveals whether an email is taken; rate limits are per address only.

- Step 2.1: the web app must call the API through a same-origin proxy that keeps the `/v1/...` paths (a Next.js rewrite). Two `*.vercel.app` hosts are different sites, so SameSite cookies would not be sent between them, and the refresh cookie is scoped to `/v1/auth`.
- Step 2.1: run one refresh at a time across tabs (for example with the Web Locks API). Two tabs refreshing with the same cookie look like a replay and sign the user out.
