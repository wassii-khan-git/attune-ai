# ADR 0010: The browser test runs against an in-memory API

- Status: Accepted
- Date: 2026-10-08

## Context

Unit tests cover the logic of both apps, and the API has integration tests against a real PostgreSQL. Neither proves that the product works when someone uses it: that the page, the proxy, the cookies, the upload, the stream and the editor fit together. One browser test of the main path is meant to prove that.

The main path creates a note, which needs the model. Calling the real model from a test means a secret in CI, a daily quota, several seconds per run, and a test that fails whenever the provider is overloaded, which it was on two of the three days this was built. The path also needs storage, and a real database in the browser test would bring migrations and cleanup with it.

## Decision

The browser test drives the production build of the web app, in Chrome, against the real API running on substitutes for its two outside dependencies:

- **Storage is in memory.** The API takes its repositories as a dependency, and the unit tests already have in-memory implementations of every one.
- **The model is scripted.** The API depends on a `ScribeModel` interface (ADR 0003). The test server gets the scripted model the unit tests use, which always returns the same short transcript and note.

Everything else is real: the Express app with its middleware, authentication, cookies, rate limits, validation, encryption and the streamed response; the web app's proxy and content security policy; the browser.

The server is `apps/api/src/testing/e2e-server.ts`. It lives in a folder the build leaves out, so it cannot be deployed. Playwright starts it, builds and starts the web app, and stops both. `pnpm test:e2e` runs it locally and in CI.

There is one test, and it follows one first-time visitor: start as a guest, try to create a note without consent, create it from a sample, see the transcript and the note, edit and reload, find the visit in the list, search, delete the visit, delete the session. It also fails if the page logs an error or throws.

The test uses the installed Chrome, not the Chromium that Playwright bundles. The sample recordings are AAC, which the bundled build cannot decode, and using the installed browser means nothing is downloaded.

## Alternatives considered

- **Intercept the network in the browser and answer from fixtures.** No server to start. It would test the pages against what the API is assumed to do, and skip the proxy, the cookies and the stream, which is where this project's bugs have been.
- **Run against the real database and the real model.** The most faithful, and it would make CI depend on a secret, a quota and a provider's uptime.
- **A switch in the production server that selects the scripted model.** One server to maintain, with test behaviour reachable from production configuration.
- **A wider suite of browser tests.** Each one is slow and breaks for reasons unrelated to what it checks. Detail belongs in unit tests; the browser test is there to prove the pieces connect.

## Consequences

- The browser test needs no secret, no database and no network. It runs in under a minute, most of it the build.
- It does not exercise the Prisma repositories or the Gemini adapter. Those are covered by the integration tests and by `pnpm eval`, and by running the app by hand.
- The in-memory repositories now carry more weight, since two kinds of test rely on them behaving like the real ones. The integration tests run the same scenarios against PostgreSQL to keep them honest.
- The scripted model answers at once, so the test does not see the note being written a piece at a time. That was checked by hand against the real model.
- CI needs Chrome on the runner. GitHub's Ubuntu image ships it.
