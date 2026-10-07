# ADR 0003: Streaming a single request instead of a job queue

- Status: Accepted
- Date: 2026-10-06

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
- If the client disconnects, the run still finishes and saves, so the result is there on the next visit.
- While a run is in progress the response also carries a blank line every ten seconds. Transcription can be silent for over a minute, and proxies on the way close a connection that says nothing for that long: the web app's own proxy does so after 30 seconds. A blank line is not an event, and clients skip it.

Newline-delimited JSON was chosen over server-sent events because the request is a `POST` with a body, which the browser's `EventSource` cannot send, and because a line of JSON is trivial to parse from a fetch stream on both web and React Native.

## Alternatives considered

- **Job queue with workers and polling.** Durable, with retries, and unaffected by the client disconnecting. It needs a worker that is always running and somewhere to keep the audio in the meantime. Both conflict with decisions already made, and the machinery is out of proportion to a five-minute recording.
- **Two requests: transcribe, then draft.** Each request is shorter, but the transcript has to be held between them, and the client has to orchestrate the steps and their failures. One request keeps the run atomic.
- **Fire and return, then poll a status endpoint.** A serverless function cannot rely on doing work after it has responded, so this would be a job queue without the queue's guarantees.
- **WebSockets.** Bidirectional messaging is not needed, and long-lived sockets are a poor fit for serverless functions.

## Consequences

- No extra infrastructure, and the recording exists only in the memory of one request.
- The user sees the transcript and then the note taking shape, instead of waiting for a finished result.
- The run is bounded by the platform's request time limit. That is why recordings are short, and the function's maximum duration must cover both model calls and their retries.
- A request that dies mid-run loses the work. The recording was never stored, so the user has to upload it again.
- Once the stream has started, a failure cannot change the HTTP status. Clients must read the final event to know whether the run succeeded.
- Longer recordings or higher volume would need the queue after all. The model sits behind the `ScribeModel` interface and the run logic in one service, so that change would replace the transport, not the pipeline.
