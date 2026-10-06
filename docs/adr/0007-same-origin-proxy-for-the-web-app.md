# ADR 0007: The web app reaches the API through a same-origin proxy

- Status: Accepted
- Date: 2026-10-06

## Context

The web app and the API are deployed as two separate Vercel projects, so each gets its own `*.vercel.app` host. Browsers treat two such hosts as different sites, because `vercel.app` is a public suffix, in the same way that two unrelated `.com` domains are different sites.

The API signs browsers in with `httpOnly`, `SameSite=Lax` cookies (ADR 0004). A `SameSite` cookie is not sent on a request from one site to another. Relaxing it to `SameSite=None` would make the cookies third-party cookies, which Safari and Firefox block by default and Chrome restricts. Calling the API directly from the browser would therefore leave users unable to stay signed in.

## Decision

The browser only ever talks to the web app. The web app forwards every request under `/v1` to the API, at the same path, from its request proxy (`src/proxy.ts`).

- **Cookies become first-party.** They are set and sent on the web app's own origin, so `SameSite` works as designed and no cross-origin request is involved.
- **The content security policy can say `connect-src 'self'`.** The page has no reason to connect anywhere else.
- **Paths are kept.** The refresh cookie is scoped to `/v1/auth`, which only matches if the browser uses the same paths as the API.
- **Headers pass through untouched,** including `Origin` and the cookies. The API uses `Origin` to refuse state-changing requests from other sites and to refuse returning tokens in a response body to a browser.
- **The client's address is passed on explicitly.** Behind the proxy the API would see every user as coming from the web app's host, which would merge all browsers into one bucket for the limits that apply before sign-in. The web app adds the address the platform reported to it, plus a secret the two apps share. The API believes the address only when the secret matches, and the web app strips any value a visitor supplies for either header.

The same proxy function serves pages with a fresh nonce and the security headers.

## Alternatives considered

- **Call the API directly, with CORS and `SameSite=None` cookies.** The textbook cross-origin setup. It depends on third-party cookies, so it fails for a large share of browsers.
- **A custom domain with two subdomains.** `app.example.com` and `api.example.com` are the same site, so cookies work without a proxy. This is the natural next step for a real deployment. It needs a domain, which a free demo does not have.
- **Keep the tokens in JavaScript and send them in a header.** No cookies and no cross-site rules, and any script that runs on the page can read the tokens. Rejected in ADR 0004.
- **Route handlers in the web app that call the API server-side.** A backend-for-frontend, with room to shape responses for the UI. Every endpoint would have to be mirrored, including the streaming upload, for no benefit at this size.

## Consequences

- Sign-in works in every browser, with no cross-origin configuration on the page.
- Each API call takes one extra hop through the web app's host. On Vercel that hop happens at the edge.
- Uploads and the streamed response pass through the proxy, so its limits apply as well. Its default body limit is above the API's 4 MB cap.
- The shared secret must be set to the same value in both projects. If it is missing, the API ignores the forwarded address and all browser traffic shares one pre-sign-in limit. That failure is strict, not permissive.
- The forwarded address is only as trustworthy as the platform's report of it to the web app. Vercel sets that itself; a host that passes on a client-supplied header would need the same care.
- The mobile app is unaffected. It calls the API directly with bearer tokens.
