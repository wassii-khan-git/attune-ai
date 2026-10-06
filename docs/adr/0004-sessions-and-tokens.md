# ADR 0004: Short-lived access tokens with rotating refresh tokens

- Status: Accepted
- Date: 2026-10-06

## Context

The API has two kinds of client. The web app runs in a browser, where any token readable by JavaScript can be stolen by a cross-site scripting bug. The mobile app is a native client with a secure keystore and no cookie jar worth relying on.

The API runs on serverless functions (ADR 0002), so there is no in-memory session store, and every database round trip adds latency to a request.

Guest sessions must end on their own after 24 hours, because the guest account is deleted then.

## Decision

Use two tokens with different jobs.

- **Access token.** A JWT signed with HS256, valid for 15 minutes, carrying the user id, role and guest flag. It is verified from its signature alone, with the algorithm, issuer and audience pinned, so an authenticated request costs no database call.
- **Refresh token.** 256 random bits, opaque to the client, valid for 7 days. The database stores only its SHA-256. Each use retires the token and issues a new one. If a retired token is presented again, every session of that user is ended and the event is written to the audit log, because the token was either stolen or replayed and the two cannot be told apart.

How the tokens travel depends on the client:

- **Browsers** receive both as cookies that are `httpOnly`, `SameSite=Lax`, host-only, and `Secure` outside local development. The refresh cookie is scoped to `/v1/auth`, so it is sent to no other route. Page scripts never see either token.
- **Native clients** ask for the tokens in the response body with an `X-Token-Transport: body` header and send the access token as a bearer token. That header is ignored whenever the request carries an `Origin` header, which browsers add and native clients do not, so a script in a browser cannot use it to read the tokens.

Cookies are sent by the browser automatically, so a cookie-authenticated request that changes state must also come from an origin on the CORS allowlist. This backs up `SameSite=Lax`.

A guest's refresh token expires 24 hours after the account was created, whatever the time of its last use.

## Alternatives considered

- **Server-side sessions with an opaque session id.** Simple to revoke, since deleting the row ends the session. Every request would need a database read, and the cost is highest exactly where the API is slowest: on a cold serverless instance opening its first connection.
- **A long-lived JWT with no refresh token.** One token and no rotation logic, but it cannot be revoked before it expires, and a long expiry turns a single leak into lasting access.
- **Tokens in `localStorage` for the web app.** It avoids cookies and their cross-site rules, and any script that runs on the page can read them. That is the outcome `httpOnly` cookies exist to prevent.
- **A hosted identity provider.** The right answer for a real product, with multi-factor sign-in and account recovery included. Here it would hide the part of the system this project is meant to show, and add an external dependency to a demo that should run on free tiers.

## Consequences

- An authenticated request needs no database call to establish who is calling.
- A stolen refresh token is useful once at most, and its second use is detected.
- An access token cannot be revoked. It stays valid for up to 15 minutes after logout, account deletion or a forced sign-out. Handlers that must not serve a deleted account check that the account still exists.
- Two tabs that refresh at the same instant with the same cookie look like a replay and sign the user out. The web app has to run one refresh at a time.
- The web app must reach the API through a same-origin proxy. Two `*.vercel.app` hosts are different sites, so `SameSite` cookies would not be sent between them directly.
- There is no password reset, email verification or multi-factor sign-in. These are listed as limits in the threat model.
