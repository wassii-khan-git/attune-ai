# Attune AI: AI clinical scribe demo (portfolio project)

Records a short (synthetic) doctor-patient conversation, transcribes it and drafts an editable SOAP note.
Audience: senior recruiters and engineering managers. The code must read like a senior engineer's production work: small scope, done properly, decisions documented.

## Hard rules
- **Synthetic data only.** Never add real patient data, real names or real recordings.
- **Never claim HIPAA compliance** in code, UI or docs. Wording: "built with HIPAA-style safeguards; demo only; not a medical device." Free tiers used here (Gemini, Vercel, Neon) have no BAA.
- **Original design.** Do not recreate any employer system. No background job queue or worker processes: generation is a single request that streams the result.
- **Secrets** live only in `.env` files (git-ignored). Keep `.env.example` updated with placeholders. Never print secrets in logs or output.
- **No PHI in logs.** Never log request bodies, transcripts or notes. Use the redacting logger.
- Do not delete or rewrite working code outside the current step.

## Monorepo (pnpm workspaces + Turborepo)
- `apps/api`: Express 5 + TypeScript, deployed as a Vercel project (root `apps/api`)
- `apps/web`: Next.js App Router + TypeScript, Tailwind, shadcn/ui, Vercel project (root `apps/web`)
- `apps/mobile`: Expo (Expo Router, NativeWind), built later
- `packages/shared`: Zod schemas and TS types shared by all apps (single source of truth)

## Stack decisions
- DB: Neon PostgreSQL + Prisma (`DATABASE_URL` pooled, `DIRECT_URL` for migrations)
- AI: Vercel AI SDK + `@ai-sdk/google` (Gemini). Model name from `GEMINI_MODEL` env, never hardcoded. Gemini transcribes audio and drafts the note.
- Note output is structured with the shared Zod `SoapNote` schema. Anything not discussed is "Not discussed"; never invent findings.
- Auth: bcrypt passwords, 15-min access JWT + rotating refresh tokens (hashed in DB). Web uses httpOnly Secure SameSite cookies; mobile uses Authorization header + expo-secure-store. "Try as guest" creates a temporary user deleted after 24h.
- Validation: Zod on every request body, params and query.
- Security middleware: helmet, CORS allowlist from env, rate limiting stored in Postgres (serverless has no shared memory).
- Logging: pino with redaction.
- Docs: OpenAPI generated from Zod schemas, served at `/docs`.
- Tests: Vitest + Supertest (api), Playwright smoke test (web). CI: GitHub Actions runs lint, typecheck, test.

## Vercel constraints (design around them)
- Request body limit ~4.5 MB: audio upload max 4 MB, recordings capped at 5 min, recorded at 24-32 kbps Opus.
- Per-request time limit: stream the note so users see output immediately.
- Audio is held in memory only, sent to Gemini, then discarded. Never written to disk, DB or storage.

## HIPAA-style safeguards (implement, then describe honestly in README)
- Transcript and note encrypted at rest at field level: AES-256-GCM, key from `ENCRYPTION_KEY` env.
- Audit log table: who did what to which visit and when. No PHI in audit rows.
- Consent timestamp stored per visit; generation is blocked without consent.
- Session idle timeout (15 min) on web; users can delete any visit or their whole account.
- Daily retention job (Vercel Cron) purges guest data older than 24h.
- HTTPS only; minimum necessary data returned by each endpoint.

## Production bar (senior-level signals)
- Layered API: routes -> controllers -> services -> repositories. No business logic in routes, no Prisma calls outside repositories.
- Config validated with Zod at startup; the app refuses to boot on missing or invalid env.
- API versioned under `/v1`, cursor pagination on lists, idempotent deletes, consistent status codes.
- Resilience: timeouts and one retry with backoff on Gemini calls; clear user-facing errors when AI fails; never lose an edited note.
- Observability: request IDs in every log line, `/health` (liveness) and `/ready` (DB check).
- Tests: unit (services), integration (API against a real Postgres in CI), Playwright e2e for the main flow. Coverage threshold 80% on `apps/api/src/services`.
- AI quality: a small evaluation set of synthetic transcripts with expected SOAP facts, runnable with `pnpm eval`; prompts versioned in code.
- Every significant decision gets a short ADR in `docs/adr/` (context, decision, alternatives, consequences).
- Security: threat model in `docs/threat-model.md`, CSP headers on web, dependency audit in CI.

## Conventions
- TypeScript strict. Small files, named exports, no `any`.
- API errors: `{ error: { code, message } }` with correct HTTP status.
- Conventional commits (`feat:`, `fix:`, `chore:`). Commit after each completed step.

## Commands (run from repo root)
- `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
- `pnpm --filter api prisma migrate dev`

## Working rules (token budget)
- Work only on the step named in the prompt. Read `docs/PROGRESS.md` first, then only the files that step needs.
- Never read `node_modules`, lockfiles, `.next`, `dist` or generated Prisma code.
- Edit files in place; do not reprint whole files in chat. Keep chat replies short.
- At the end of each step: run lint, typecheck and tests, update `docs/PROGRESS.md` (done + next), commit.