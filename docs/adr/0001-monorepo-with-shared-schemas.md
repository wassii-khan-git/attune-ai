# ADR 0001: Monorepo with shared schemas

- Status: Accepted
- Date: 2026-10-06

## Context

Attune AI has three apps built on one data contract: an Express API, a Next.js web app and an Expo mobile app. They exchange the same payloads. The most important payload, the SOAP note, is also the structured output the language model has to produce.

If each app describes these shapes on its own, the descriptions drift. The API starts rejecting a field the web form still sends, or the mobile app keeps reading a field the API has renamed. TypeScript types do not solve this at the edges, because request bodies and model output arrive as untyped JSON and have to be checked at runtime.

One person builds and maintains the project, so the answer has to add very little overhead.

## Decision

Keep every app in one repository, managed with pnpm workspaces and Turborepo, and define the contract once, in `packages/shared`.

- `packages/shared` holds Zod schemas. TypeScript types are inferred from them with `z.infer` and never written by hand, so the runtime check and the compile-time type cannot disagree.
- The API validates input against these schemas and will generate its OpenAPI document from them. The web and mobile clients use the same schemas to type and check responses.
- The package is compiled to ESM JavaScript with declaration files, and apps import the compiled output. It is compiled with no ambient types (`"types": []`), so it cannot reach for Node or browser globals and stays usable from all three runtimes.
- Every workspace takes Zod from a single pnpm catalog entry, so a schema is the same object on both sides of a package boundary.
- Turborepo builds the shared package before any task that imports it (`"dependsOn": ["^build"]`) and caches the result.

## Alternatives considered

- **Separate repositories with a published contract package.** Each contract change becomes a publish, a version bump and one pull request per app. That is heavy for a single developer, and a change can no longer land in one commit.
- **OpenAPI first, with generated clients.** A good fit when teams work in several languages. Here everything is TypeScript, so a hand-written spec would be a second source of truth beside the runtime validators, plus a code generation step. Generating OpenAPI from the Zod schemas produces the same document from one source.
- **tRPC.** It removes the contract problem inside a TypeScript codebase, but it replaces the HTTP API with an RPC layer. This project wants a plain, versioned REST API that can be documented and called from any client.
- **Importing the shared package as TypeScript source.** This needs no build step and works when every consumer has a bundler. The API runs on plain Node, so compiled output is the one form that works everywhere.

## Consequences

- A contract change is a single commit, and the compiler names every app it breaks.
- `packages/shared` must be built before its dependents can be type-checked, linted or tested. The root scripts handle this through Turborepo. Running a package script directly requires building the shared package first.
- The shared package has to stay free of platform-specific code.
- Compile-time safety only covers code built from the same commit. An installed mobile build can be older than the deployed API, so the API is versioned under `/v1` and changes within a version must be additive.
