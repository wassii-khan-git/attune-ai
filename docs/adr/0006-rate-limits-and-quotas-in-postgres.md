# ADR 0006: Rate limits and quotas stored in PostgreSQL

- Status: Accepted
- Date: 2026-10-06

## Context

Three things need throttling. Sign-in routes must resist password guessing. Guest creation and uploads must not be usable to fill the database or exhaust memory. Above all, note generation calls a language model through a single free-tier key that every user of the demo shares, so one abusive caller could use up the day's allowance for everyone.

The usual in-process rate limiter does not work here. The API runs as serverless functions (ADR 0002): instances share no memory, come and go with traffic, and several may serve the same caller at once. A counter kept in one instance is invisible to the others.

## Decision

Keep every counter in PostgreSQL, which all instances already share.

- **Mechanism.** A fixed time window per counter. Each request performs one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`, which is atomic, so concurrent requests on different instances cannot lose an increment or both read "under the limit".
- **Before sign-in, count by client address.** Register and login allow 10 requests per 5 minutes, refresh and logout 60 per 5 minutes, and guest creation 5 per hour.
- **After sign-in, count by user.** Visit writes allow 300 per 5 minutes and uploads 20 per 5 minutes. The upload limit is checked before the body is read. Counting by account means a limit cannot be dodged by changing address.
- **Generation has three layers.** Each user gets 10 generations per UTC day, or 3 as a guest. All users together get a daily budget, set by `DAILY_GENERATION_BUDGET`. The shared counter is kept apart from the per-user rows, so deleting accounts cannot reset it. An account also holds a capped number of visits.
- **Privacy.** The key of a counter is a SHA-256 of the policy name and the caller, so the table holds no raw addresses. This is pseudonymisation and is described as such.
- **Cleanup.** The daily retention job deletes counters whose window has passed.

Behind a platform proxy the client address is only correct if the proxy is trusted for exactly the right number of hops. That number is a required setting in production, and the API refuses to start without it.

## Alternatives considered

- **In-memory counters.** No latency and no storage, and wrong on serverless for the reason above. Each instance would enforce its own separate limit.
- **Redis.** The standard store for rate limiting: fast, with expiry built in. It would be a second stateful service to provision, secure and keep within a free tier, for traffic that a database handles easily.
- **The platform's firewall.** Good at absorbing volumetric attacks before they reach the application, and worth enabling. It cannot express rules such as "three generations per guest per day", which depend on who the caller is.
- **Sliding-window or token-bucket algorithms.** Smoother than a fixed window, which lets a caller spend up to two windows' worth across a boundary. They need more state or more queries per request. For slowing down password guessing and capping a daily budget, the fixed window's imprecision does not matter.

## Consequences

- Limits hold across instances and survive restarts.
- Every throttled route costs one extra database write. That is acceptable at this scale and would be the first thing to move to Redis under real load.
- Limits by address are coarse. Users behind one shared address share a budget, and an attacker with many addresses is slowed down but not stopped. The per-user and global limits do not have this weakness.
- A generation counts against the quota when it starts and is not refunded if the model fails. Refunds would let a caller retry without limit against a model that is struggling.
- When the shared daily budget is spent, generation stops for everyone until the next UTC day. That is the intended failure: the demo degrades, and the key's allowance is not exhausted by one caller.
