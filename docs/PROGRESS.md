# Progress

## Done

- Phase 1, Step 1.1: monorepo scaffold (pnpm + Turborepo, `apps/api`, `packages/shared`, root ESLint/Prettier/tsconfig, validated config, `/health` and `/ready`, ADR 0001 and 0002)

## Next

- Phase 1, Step 1.2: database schema

## Notes / decisions

- TypeScript is pinned to 6.0.x because typescript-eslint 8 does not support TypeScript 7 yet.
- `packages/shared` is compiled and apps import its `dist`. Use the root scripts so Turborepo builds it first.
- `apps/api/src/config/env.ts` already validates every variable; a test fails if `.env.example` drifts from it. `DIRECT_URL` is in `.env.example` only (Prisma CLI, not the running API).
- `/ready` runs a list of `ReadinessCheck`s. The list is empty until step 1.2 registers the database check in `src/server.ts`.
- Left for step 1.4: unknown routes return Express's default HTML 404, `X-Powered-By` is still sent, and `server.ts` uses `console` for boot output (drop its eslint-disable when pino lands).
- ESLint enforces the API layering (`no-restricted-imports`) and bans `console`.
- pnpm blocks dependency install scripts (`allowBuilds`) and applies a release-age cooldown. If install rejects a fresh release, lower the version range; do not add an exclusion.
