# ADR 0002: Vercel serverless over an always-on server

- Status: Accepted
- Date: 2026-10-06

## Context

Attune AI is a portfolio demo. It has to be reachable from a link at any time, cost nothing to keep online, and need no operational care. Traffic is a handful of visitors with long idle gaps between them.

Most requests are short reads and writes. One is long: it uploads a recording, has Gemini transcribe it, and returns a drafted note.

## Decision

Deploy the API as serverless functions on Vercel, with `apps/api` as the project root, backed by Neon serverless PostgreSQL.

The Express app is built by a factory, `createApp`, which does not bind a port. The same app runs under a local Node server (`src/server.ts`), under Supertest in tests, and behind the serverless entry point. Routes, controllers, services and repositories do not know which host they run on.

Serverless hosting fixes several constraints. The design accepts them from the start instead of working around them later:

| Constraint                         | Design response                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| No memory shared between requests  | Rate-limit counters and all other state live in Postgres.                                                                       |
| Request body limit of about 4.5 MB | Uploads are capped at 4 MB. Recordings are limited to 5 minutes at 24-32 kbps Opus, which is about 1.2 MB at the upper bitrate. |
| Per-request time limit             | The note is streamed, so output starts arriving straight away.                                                                  |
| No background workers              | Note generation is a single streaming request. Scheduled work runs from Vercel Cron, which calls a protected endpoint.          |
| Many short-lived instances         | The API connects through Neon's pooled connection string.                                                                       |

## Alternatives considered

- **An always-on container.** This allows in-memory state, long requests and background workers. Keeping a process running all day for a few visits is the wrong shape for this traffic. It either costs money or, on free tiers that suspend idle services, makes the first visitor wait for a full boot.
- **A virtual machine.** Full control, at the price of a monthly bill and of patching and monitoring a server for a demo.
- **AWS Lambda with API Gateway.** The same execution model with more infrastructure to define. Vercel also hosts the web app, which gives both apps one deployment workflow and preview deployments.
- **A job queue with worker processes for note generation.** This is the usual design for long AI work, and the right one for longer recordings or higher volume. It needs an always-on worker and adds queueing, retry and status-polling machinery that a five-minute recording does not need. The streaming design will be recorded in its own ADR when the AI pipeline is built.

## Consequences

- There are no servers to run, the cost at this traffic is zero, and every push produces a deployment.
- The first request after an idle period pays a cold start. Startup work is kept small for that reason.
- Platform limits shape the product: recordings are short and uploads are small.
- The free tiers used here come without a business associate agreement. That is one reason the project is a demo and makes no claim of HIPAA compliance.
- Leaving Vercel is cheap. The app is plain Express, and platform-specific code is confined to the serverless entry point and the cron configuration, so moving to a container means running `src/server.ts` and replacing the scheduler.
