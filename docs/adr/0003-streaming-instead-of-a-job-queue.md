# ADR 0003: Streaming a single request instead of a job queue

- Status: Accepted
- Date: 2026-10-06 (amended 2026-10-08: a model per task, and a fallback model)

## Context

Turning a recording into a note takes two model calls: one transcribes the audio with speaker labels, the other drafts the SOAP note from the transcript. Together they take from several seconds to about a minute. That is too long to leave a user looking at a spinner, and long enough that the usual design is a job queue: accept the upload, enqueue a job, let a worker process it, and have the client poll for the result.

Two earlier decisions rule that design out:

- The API runs on serverless functions with no always-on worker (ADR 0002).
- Audio is never persisted. A queued job would need the recording stored somewhere until a worker picked it up.

Recordings are capped at 5 minutes and 4 MB, so the work always fits inside one request.

## Decision

`POST /v1/visits/:id/process` does everything in one request and streams its progress.

- The request carries the recording as a multipart upload, parsed into memory.
- Everything that can be refused is refused before the stream starts, with an ordinary status code: unknown visit (404), missing consent (403), a run already in flight (409), daily quota reached (429), not an audio file (415), too large (413).
- After that the response is `200` with `application/x-ndjson`: one JSON event per line. The events are `stage`, `transcript`, `note` (a snapshot of the note so far, each replacing the last), and finally exactly one `done` or `error`.
- The visit's `status` column records the run. Starting a run is a single atomic update to `PROCESSING`, so two uploads cannot both proceed. A visit left in `PROCESSING` for more than five minutes belongs to a request that died and can be claimed again.
- The transcript and note are saved together at the end, encrypted. A failed run saves nothing and marks the visit `FAILED`.
- Each model call has a timeout and is retried once after a short pause, and only when the failure is transient.
- Each of the two calls has its own model and, optionally, a fallback model. See "Models and fallback" below.
- If the client disconnects, the run still finishes and saves, so the result is there on the next visit.
- While a run is in progress the response also carries a blank line every ten seconds. Transcription can be silent for over a minute, and proxies on the way close a connection that says nothing for that long: the web app's own proxy does so after 30 seconds. A blank line is not an event, and clients skip it.

Newline-delimited JSON was chosen over server-sent events because the request is a `POST` with a body, which the browser's `EventSource` cannot send, and because a line of JSON is trivial to parse from a fetch stream on both web and React Native.

### Models and fallback

Added on 2026-10-08. While this was being built the provider answered `503` ("high demand") for one model on two days out of three, for forty seconds at a time, while another model of the same family answered normally. With a single configured model, every run failed for as long as that lasted.

- **A model per task.** Transcription needs a model that accepts audio; drafting only reads text. `GEMINI_TRANSCRIBE_MODEL` and `GEMINI_NOTE_MODEL` name them. Both are optional and default to `GEMINI_MODEL`, so an existing deployment keeps working with no change to its settings.
- **An optional fallback per task.** `GEMINI_TRANSCRIBE_FALLBACK_MODEL` and `GEMINI_NOTE_FALLBACK_MODEL`. Each task falls back independently.
- **The fallback takes the place of the retry.** A call still gets two attempts. When the first fails because the model is overloaded, down, out of quota, too slow or gone (HTTP 429, 5xx, no answer, a timeout, or 404 for a model that has been retired), the second goes to the fallback model if one is set. After any other retryable failure, such as output that does not fit the schema, the same model is asked again. A request the provider rejects is not retried at all.
- **The service decides, not the adapter.** The generation service owns the retry, so it also owns the choice of model for it. The adapter makes one call to the model it is given.
- **Two failures, two messages.** The adapter sorts every failure into `unavailable`, `invalid_output` or `rejected`. The first reaches the client as `AI_UNAVAILABLE` ("The AI service is busy right now. Please try again in a minute."), the others as `AI_FAILED`. The provider's own wording is never sent on or logged.
- **Each retry is logged**, with the stage and where it went, and the final log line of a run says which model wrote each part. Otherwise a run saved by its fallback would hide that the first model is failing.

## Alternatives considered

- **Job queue with workers and polling.** Durable, with retries, and unaffected by the client disconnecting. It needs a worker that is always running and somewhere to keep the audio in the meantime. Both conflict with decisions already made, and the machinery is out of proportion to a five-minute recording.
- **Two requests: transcribe, then draft.** Each request is shorter, but the transcript has to be held between them, and the client has to orchestrate the steps and their failures. One request keeps the run atomic.
- **Fire and return, then poll a status endpoint.** A serverless function cannot rely on doing work after it has responded, so this would be a job queue without the queue's guarantees.
- **WebSockets.** Bidirectional messaging is not needed, and long-lived sockets are a poor fit for serverless functions.
- **Fall back inside the adapter, on every call.** The service would not need to know. But the service's retry would then wrap it, giving up to four calls per stage, and the two models would have to share one timeout: a model that takes forty seconds to refuse would leave its fallback too little time.
- **Remember that a model is down and skip it for a while (a circuit breaker).** It saves the wasted first attempt. Serverless functions share no memory, so the state would have to live in Postgres, read on every run. Not worth it at this volume.
- **Require the two per-task variables and drop `GEMINI_MODEL`.** Fewer variables. Because the API refuses to start on a missing variable, the live deployment would have gone down on the next push, until its settings were changed.

## Consequences

- No extra infrastructure, and the recording exists only in the memory of one request.
- The user sees the transcript and then the note taking shape, instead of waiting for a finished result.
- The run is bounded by the platform's request time limit. That is why recordings are short, and the function's maximum duration must cover both model calls and their retries.
- A request that dies mid-run loses the work. The recording was never stored, so the user has to upload it again.
- Once the stream has started, a failure cannot change the HTTP status. Clients must read the final event to know whether the run succeeded.
- A fallback adds no time to the worst case, because it replaces the retry. The time limit is still two attempts per call.
- A note may be written by the fallback model, so a prompt has to pass `pnpm eval` on both. The evaluation scores the configured note model only; the fallback is scored by running it with `GEMINI_NOTE_MODEL` set to that model.
- A failed run still counts against the user's daily quota (ADR 0006), including one that failed because the service was busy.
- Longer recordings or higher volume would need the queue after all. The model sits behind the `ScribeModel` interface and the run logic in one service, so that change would replace the transport, not the pipeline.
