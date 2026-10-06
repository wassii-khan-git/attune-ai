# Progress

## Done

- Phase 1, Step 1.1: monorepo scaffold (pnpm + Turborepo, `apps/api`, `packages/shared`, root ESLint/Prettier/tsconfig, validated config, `/health` and `/ready`, ADR 0001 and 0002)
- Phase 1, Step 1.2: database schema (Prisma 7 on Neon, five models, first migration applied, AES-256-GCM field cipher with tests, `/ready` checks the database)

- Phase 1, Step 1.4: security baseline (helmet, CORS allowlist, pino logger with redaction, request ids, error envelope, audit service). Done before 1.3 because auth depends on it.

## Next

- Phase 1, Step 1.3: auth

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
