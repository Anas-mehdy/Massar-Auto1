# Massar Offline V1 Foundation

## Scope

V1 establishes the offline foundation without changing production behavior yet:

1. Browser local database (IndexedDB).
2. Stable per-device identity.
3. Customer local repository.
4. Durable outbox mutations with operation IDs.
5. Sync protocol boundary.
6. Offline authentication design boundary.

Customers are the pilot entity. Financial, inventory, repair, purchase, and reporting modules remain server-authoritative until their dedicated phases.

## Invariants

- PostgreSQL/Supabase remains the server source of truth.
- Clients never receive database credentials.
- Every offline write carries a globally unique `operationId` and a stable `deviceId`.
- Server mutation processing must be idempotent.
- Existing `shopId` tenant boundaries are preserved.
- Existing `version` and `deletedAt` fields are used for optimistic conflict detection and tombstones.
- Client timestamps are informational only. Pull synchronization must use a server-issued cursor/sequence, not device time.
- Offline permissions are cached authorization snapshots; membership/user management remains online-authoritative.

## Local stores

### customers
Local customer projection used by offline UI.

### outbox
Durable business mutations waiting for server acknowledgement.

### meta
Sync cursor and other small device-local synchronization metadata.

## Customer mutation contract

Supported V1 operations:

- `customer.create`
- `customer.update`
- `customer.delete`

Each mutation includes:

- operationId
- deviceId
- shopId
- userId
- entityId
- baseVersion
- payload
- createdAt

New offline customers use a UUID locally as both their record ID and `clientGeneratedId`. The server must preserve/reconcile this identity idempotently.

## Sync API target

The next V1 increment should expose authenticated server endpoints conceptually equivalent to:

- `POST /api/sync/push`
- `GET /api/sync/pull?cursor=...`

Push must:

1. Authenticate the current server session.
2. Reject cross-shop/user spoofing.
3. Deduplicate by operationId.
4. Apply each mutation with server-side validation.
5. Return applied/conflict/rejected results plus authoritative records.

Pull must:

1. Return only the authenticated shop's allowed data.
2. Use a monotonic server cursor/change sequence.
3. Include tombstones so deletes propagate.
4. Return updated authorization snapshots when appropriate.

## Offline auth target

The existing HTTP session continues to authenticate online requests. V1 will add a device-local authorization snapshot after a successful online validation. It must contain only the minimum data required to render and authorize offline-capable screens and must have an expiry/revalidation policy. Password hashes and server secrets must never be stored in the offline database.

## Rollout rule

Do not switch existing customer screens to local-first reads/writes until push, pull, reconciliation, and auth snapshot behavior are implemented and tested. Until then these modules are foundation-only and do not alter current production workflows.
