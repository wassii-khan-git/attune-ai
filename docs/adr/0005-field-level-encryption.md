# ADR 0005: Field-level encryption for transcripts and notes

- Status: Accepted
- Date: 2026-10-06

## Context

The transcript and the SOAP note are the most sensitive data the system holds. The database provider already encrypts its storage, which protects against someone walking off with a disk. It does not protect against the cases more likely for a small hosted application: a leaked database credential, an exposed backup, a query console left open, or a SQL injection bug. In all of those the attacker reads rows through the database, and the storage encryption is transparent to them.

## Decision

Encrypt the transcript and the note in the application, one field at a time, before they are written.

- **Algorithm.** AES-256-GCM, with a fresh random 96-bit nonce for every encryption and a 128-bit authentication tag. GCM gives confidentiality and detects any modification.
- **Key.** 32 bytes from the `ENCRYPTION_KEY` environment variable, checked for length at startup. The key never reaches the database.
- **Envelope.** `v1.<nonce>.<tag>.<ciphertext>`, each part base64url. The version prefix leaves room to change the algorithm or the key later without guessing how an old value was written.
- **Context binding.** Each value is encrypted with additional authenticated data naming where it lives, for example `visit:<id>:note`. The context is not stored. A ciphertext copied into another visit, or from the note column to the transcript column, fails to decrypt.
- **Decryption happens in one place.** Only the endpoint that returns a single visit decrypts, and each call writes an audit row. List queries do not select the encrypted columns at all.
- **Failure is silent to the outside.** A value that will not decrypt produces a generic server error. The cause is neither returned nor logged.

Visit titles are not encrypted, because they have to be searchable. They are treated as sensitive everywhere else: never logged, and only returned to their owner.

## Alternatives considered

- **Rely on the provider's encryption at rest.** No code to write, and no protection in any of the scenarios above.
- **Encrypt in the database with `pgcrypto`.** The key would have to be sent to the database in each query, where it can appear in query logs and statement statistics. Keeping the key in the application means the database never sees it.
- **Envelope encryption with a key management service.** A data key per record, wrapped by a master key that never leaves the service, with rotation and access logging built in. This is the right design for real patient data. It needs a paid service and adds a network call per operation, which is out of proportion for a demo on free tiers.
- **Encrypt the title as well.** Search would then need a separate blind index or would have to load and decrypt every title. The title is short and chosen by the user, so the trade was made in favour of search and documented.

## Consequences

- A copy of the database alone does not reveal a transcript or a note.
- Rows cannot be tampered with or moved between visits without detection.
- The encrypted fields cannot be searched, sorted or filtered in SQL.
- Losing `ENCRYPTION_KEY` loses the data. There is no recovery path.
- There is one key and no rotation procedure yet. The version prefix makes one possible: a `v2` writer, a reader that accepts both, and a job that rewrites old rows.
- Anyone who obtains both the database and the application's environment can decrypt everything. The scheme narrows the set of leaks that expose clinical text; it does not remove them.
