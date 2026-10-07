# Threat model

Last reviewed: 2026-10-08, after the review of `apps/web`. It covers the API and the web app. The mobile app will add its own section when it is built.

## Scope and honesty

Attune AI is a demo. It is built with HIPAA-style safeguards; it is demo only and not a medical device. It is **not** HIPAA compliant and must only ever hold synthetic data. The hosting, database and model providers are used on free tiers, with no business associate agreement.

This document says what the system protects, what could go wrong, what is done about it, and what is knowingly left undone. The last part matters as much as the rest.

## The system in brief

A clinician records a short consultation. The API transcribes the recording with a language model, drafts a SOAP note from the transcript, and stores both for the clinician to review and edit.

Data crosses four boundaries:

1. **Client to API**, over HTTPS. The API runs as a serverless function on Vercel.
2. **API to database**, over TLS. The database is Neon PostgreSQL.
3. **API to model provider**, over HTTPS. The recording and then the transcript are sent to Google's Gemini API.
4. **Scheduler to API**. Vercel Cron calls one internal endpoint once a day.

## What is being protected

In order of sensitivity:

1. **Transcripts and notes.** The clinical content.
2. **Recordings.** Held in memory for one request, sent to the model provider, never stored.
3. **Visit titles, account emails and metadata.**
4. **Credentials.** Password hashes, refresh tokens, access tokens.
5. **Secrets.** The field encryption key, the token signing secret, database credentials, the model API key, the scheduler secret.
6. **The audit trail.**
7. **The shared model allowance.** One free-tier key serves every user, so exhausting it takes the demo down for everyone.

## Who might attack

- Anyone on the internet, without an account.
- A signed-in user trying to reach another user's data.
- Someone holding a stolen token.
- Someone who can read the database or a copy of it, but not the application's environment.
- Someone who can read the logs.
- Whoever controls what is said in a recording, which reaches the model as text.
- A compromised dependency.

Out of scope: a malicious or compromised platform provider, a compromised developer machine, and physical access.

## Threats and mitigations

### Sign-in and sessions

| Threat                       | Mitigation                                                                                                                                                                                                      | What remains                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guessing passwords           | bcrypt at cost 12. Ten attempts per five minutes per address. An unknown email and a wrong password get the same answer, after the same hashing work. A wrong password on a real account is audited and logged. | The limit is per address, so many addresses slow an attacker down without stopping them. There is no account lockout and no second factor.                 |
| Using a stolen access token  | It lives 15 minutes. In browsers it is an `httpOnly` cookie that page scripts cannot read.                                                                                                                      | It cannot be revoked. It works until it expires, even after logout or account deletion.                                                                    |
| Using a stolen refresh token | Only a hash is stored. Each token works once. A second use ends every session of that user and is audited as a forced sign-out.                                                                                 | A thief who uses the token before its owner gets a session, until the owner's next refresh exposes the replay.                                             |
| Forging a token              | The signing algorithm, issuer and audience are pinned. Tests cover an unsigned token, an altered payload and a wrong secret.                                                                                    | Nothing beyond the secrecy of the signing key.                                                                                                             |
| Cross-site request forgery   | Cookies are `SameSite=Lax`. A cookie-authenticated request that changes state must come from an allowlisted origin. Only JSON and multipart bodies are accepted.                                                | None known.                                                                                                                                                |
| Script reading tokens        | Tokens are only returned in a response body to clients that send no `Origin` header, which excludes browsers.                                                                                                   | This relies on the web proxy forwarding `Origin` unchanged. A script injected into the web app could still act as the user while the page is open.         |
| Learning who has an account  | Sign-in gives nothing away.                                                                                                                                                                                     | Registration answers "email already registered", and a failed sign-in on a real account is slightly slower because it writes an audit row. See the limits. |

Design record: [ADR 0004](adr/0004-sessions-and-tokens.md).

### Access to other people's data

| Threat                                   | Mitigation                                                                                                                                                           | What remains |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Reading or changing someone else's visit | The owner's id is part of every query. Another user's visit answers 404, exactly like a missing one. Unit and integration tests cover each route with a second user. | None known.  |
| Calling the scheduler's endpoint         | It requires a secret, compared in constant time, and answers 404 without it. It is absent from the API documentation.                                                | None known.  |

### Data at rest

| Threat                              | Mitigation                                                                                                                                                                      | What remains                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A leaked database or backup         | Transcripts and notes are encrypted per field with AES-256-GCM, and the key is not in the database. Passwords are bcrypt hashes. Refresh tokens and rate-limit keys are hashes. | Titles, emails and metadata are readable. Anyone who also has the application's environment can decrypt everything. There is one key and no rotation yet.    |
| Altering or moving encrypted values | GCM detects any change. Each value is bound to its visit and column, so one copied elsewhere will not decrypt.                                                                  | None known.                                                                                                                                                  |
| Data outliving its purpose          | Users can delete a visit or their account. A daily job deletes guest accounts older than 24 hours with everything they own.                                                     | On the free plan the job runs at some point each day, so guest data can live up to about 48 hours. The provider's history may hold deleted rows for a while. |

Design record: [ADR 0005](adr/0005-field-level-encryption.md).

### Data in transit and third parties

| Threat                            | Mitigation                                                                                                              | What remains                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Interception                      | HTTPS everywhere, with HSTS. The API's database connection verifies the server certificate.                             | None known.                                                                                 |
| The model provider sees the audio | Unavoidable: transcription is the product. Nothing but the recording and the transcript is sent, and neither is stored. | The provider processes this data under free-tier terms, without a BAA. Synthetic data only. |

### Logs and error messages

| Threat                              | Mitigation                                                                                                                                                                                                                                                                           | What remains                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Clinical text or secrets in logs    | Request logs hold the method, path, status and duration only: no bodies, headers or query strings. Sensitive keys are redacted. Messages of library errors are never logged, because they can quote the data being handled. Crashes go through the same logger. Lint bans `console`. | The platform's own request logs record full URLs, which include the title search term. |
| Error responses revealing internals | Unexpected errors return a fixed message. Validation errors name the field and the rule, never the value sent.                                                                                                                                                                       | None known.                                                                            |
| Not noticing an attack              | Refused sign-ins, replayed tokens, blocked origins and rate-limit hits are logged with a reason and, where known, the account.                                                                                                                                                       | Nothing reads these logs automatically. There are no alerts.                           |

Tests for each flow assert that passwords, tokens, emails, titles, transcripts and notes are absent from the log output.

### Input handling

| Threat                        | Mitigation                                                                                                                                                    | What remains                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Hostile or malformed requests | Every body, path parameter and query is validated against a schema. JSON bodies are capped at 100 KB. SQL is parameterised, and search wildcards are escaped. | None known.                                                                                |
| Uploading something else      | One file of at most 4 MB. Its type is read from its bytes, not from what the client claims. The upload limit is checked before the body is read.              | None known.                                                                                |
| Very long recordings          | The size cap bounds the work, and model calls time out.                                                                                                       | The 5-minute limit is declared by the client. A low-bitrate file under 4 MB can be longer. |

### The language model

| Threat                             | Mitigation                                                                                                                                                                                               | What remains                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Instructions hidden in a recording | The transcript is passed as material to document, with an explicit rule not to act on it. The model has no tools and can only return a note that matches a fixed schema. An evaluation case covers this. | What is said can still shape the wording of the note. A clinician must review it. Clients must render it as text. |
| Invented findings                  | The prompt forbids anything not stated and requires "Not discussed" for sections that were not covered. An evaluation set checks required facts, invented claims and empty sections.                     | Models make mistakes. The note is a draft for review, and this is not a medical device.                           |
| Losing a clinician's edits         | A second recording is refused if a note exists, unless the request confirms the replacement. Notes cannot be edited while a visit is being processed.                                                    | None known.                                                                                                       |

Design record: [ADR 0003](adr/0003-streaming-instead-of-a-job-queue.md).

### Availability and abuse

| Threat                                                   | Mitigation                                                                                                                                                                                                                             | What remains                                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Using up the shared model allowance                      | Ten generations a day per user, three per guest, five guests an hour per address, and one daily budget across all users that deleting accounts cannot reset.                                                                           | Enough distinct callers can spend the day's budget. Generation then stops for everyone until the next day.                                                                    |
| Filling the database or memory                           | A cap on visits per account. Per-user limits on writes and uploads. Body size limits. The daily retention job.                                                                                                                         | None known at demo scale.                                                                                                                                                     |
| Forging a client address, or hiding behind the web app's | Browser traffic reaches the API through the web app, which passes on each browser's address with a secret the two apps share. The API believes the address only with that secret, and the web app strips any value a visitor supplies. | Without the secret configured, all browsers share one limit before sign-in, which is stricter, not looser. The address is as reliable as the hosting platform's report of it. |
| A slow or failing dependency                             | Model calls have a timeout and one retry for transient failures. Readiness has its own timeout. A run left unfinished by a crashed request is released after 5 minutes.                                                                | `/ready` is public and queries the database on every call.                                                                                                                    |

Design records: [ADR 0006](adr/0006-rate-limits-and-quotas-in-postgres.md), [ADR 0007](adr/0007-same-origin-proxy-for-the-web-app.md).

### Configuration, deployment and dependencies

| Threat                              | Mitigation                                                                                                                                                                                                                | What remains                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A misconfigured deployment          | The environment is validated at startup and the API refuses to boot on any problem. `NODE_ENV` is required. Production also refuses plain-http origins and a missing proxy setting.                                       | None known.                                                      |
| Secrets committed to the repository | Env files are git-ignored. Only a template with placeholders is committed, and a test keeps it in step with the code.                                                                                                     | None known.                                                      |
| An unreviewed migration             | Migrations run only when building a production deployment, never a preview.                                                                                                                                               | The application uses one database role with full rights.         |
| A compromised dependency            | New releases are held back for a cooling-off period. Install scripts are blocked. CI is set up to run a dependency audit and static analysis. GitHub Actions are pinned to commits. The docs viewer is integrity-checked. | The cooling-off period narrows the window; it does not close it. |

### The audit trail

| Threat                           | Mitigation                                                                                                                                                                                                                                                   | What remains                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions that leave no record     | Registrations, sign-ins and sign-outs, failed sign-ins, forced sign-outs, account deletions, and every creation, view, edit, processing and deletion of a visit are recorded with who, what and when. If the audit row cannot be written, the request fails. | Listing visits, which shows titles, is not audited. A change and its audit row are separate statements, so a failure between the two can leave a change without a record. |
| Clinical text in the audit trail | Its columns are identifiers, enumerations and a timestamp. There is nowhere to put free text.                                                                                                                                                                | Rows keep the account's identifier after the account is deleted.                                                                                                          |
| Tampering with the record        | Rows are only ever inserted by the application.                                                                                                                                                                                                              | The trail lives in the same database and is not tamper-evident. Anyone with database write access could alter it.                                                         |

### The web app

The web app is a Next.js site on its own Vercel project. The browser only ever talks to that site, which forwards API calls to the API at the same path ([ADR 0007](adr/0007-same-origin-proxy-for-the-web-app.md)). What the browser keeps between visits is two timestamps and the theme. Recordings, transcripts and notes exist only in the memory of the open page.

| Threat                                           | Mitigation                                                                                                                                                                                                                                                                                                    | What remains                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A script injected into a page                    | A content security policy with a fresh nonce per response: only scripts carrying it run, and nothing may generate code at run time. No script, style, font or image is loaded from another site. The transcript and the note, which are model output, are rendered as text and never as markup.               | Styles allow inline declarations. A script that did run could act as the user while the page is open.                                                                              |
| Clinical text left behind on a shared computer   | Notes and transcripts are never put in browser storage. API responses are marked `no-store`. The note fields opt out of the browser's saved form data. A visit's title is kept out of the tab title, and the search text out of the address bar. A session ends after 15 minutes without input, in every tab. | Anything the user copies, prints or saves as a PDF has left the app. The print dialog can add the page address, which contains the visit's identifier.                             |
| Clinical text sent somewhere else by the browser | The app sends data only to its own origin. Nothing is logged to the console, and the error page never shows an error's text.                                                                                                                                                                                  | Spellcheck stays on in the note editor. A browser whose user has turned on its cloud spellcheck sends what is typed to the browser's vendor. Browser extensions can read any page. |
| Recording without consent                        | The record button does not start until consent is confirmed, and the API refuses to process a visit without it. The microphone is the only device feature the site may use, and only on its own origin.                                                                                                       | Consent is the user's statement. Nothing can verify it.                                                                                                                            |
| A recording kept longer than needed              | It lives in the page's memory until it is uploaded, and is dropped once the note exists. It is never written to browser storage.                                                                                                                                                                              | It stays in memory while a failed run can still be retried.                                                                                                                        |
| Losing an edit                                   | A note saves itself after each pause in typing, when a field is left and when the page is left. A failed save keeps the text and is retried. The browser warns before unsaved text is discarded. See [ADR 0009](adr/0009-editing-saving-and-exporting-the-note.md).                                           | Two tabs editing one note: the later save wins. A sign-out for inactivity discards text that could not be saved.                                                                   |
| Being sent to another site after sign-in         | The return address after sign-in must be a path on this site. Absolute and protocol-relative addresses are refused.                                                                                                                                                                                           | None known.                                                                                                                                                                        |
| The site shown inside another site               | Framing is forbidden by the content security policy and by `X-Frame-Options`.                                                                                                                                                                                                                                 | None known.                                                                                                                                                                        |
| A forged client address through the proxy        | The web app removes any address a visitor supplies, and the API believes the forwarded one only with a secret the two apps share.                                                                                                                                                                             | If the secret is not set, all browsers share one limit before sign-in. That fails closed.                                                                                          |

## Known limits of the demo

These are accepted for a demo and would each need work before real use.

- **No compliance.** Not HIPAA compliant. No BAA with any provider. Recordings and transcripts are sent to a third-party model.
- **Account lifecycle.** No email verification, password reset or multi-factor sign-in. Registration reveals whether an email is already registered. Deleting an account does not ask for the password again.
- **Sessions.** An access token stays valid for up to 15 minutes after logout. The 15-minute idle timeout is enforced by the web client, not by the server.
- **Retention.** Guest data can live up to about 48 hours, because the free plan's scheduler runs once a day at an unspecified minute.
- **Encryption.** One key, no rotation. Titles and emails are not encrypted.
- **Throttling.** Limits before sign-in are per address and use fixed windows, which allow a short burst across a window boundary.
- **Search.** The web app keeps the title search out of the address bar, but the term still travels as a query parameter of an API request, where the hosting platform's logs can keep it.
- **Recording length.** Declared by the client. The server enforces file size.
- **Monitoring.** Security events are logged but nothing alerts on them.
- **Database access.** A single role with full rights; no row-level security.
- **Audit trail.** Not tamper-evident, and stored beside the data it describes.
- **The browser.** Cloud spellcheck, extensions, the clipboard and printed copies are outside the app's control. The warning before leaving a page with an unsent recording does not cover the browser's back button.

## What real patient data would require

A short list, to be clear about the distance between this demo and a system for real use: providers under a BAA; a key management service with rotation; a hosted identity provider with multi-factor sign-in; server-side idle timeout and revocable sessions; an append-only audit log outside the application database; least-privilege database roles; alerting on the security events already logged; an independent penetration test; and clinical safety review of the model's output.
