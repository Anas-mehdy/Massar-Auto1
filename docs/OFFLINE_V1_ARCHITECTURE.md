# Massar Offline V1 Foundation

## Scope

V1 establishes the offline foundation while keeping current production workflows unchanged until the pilot is explicitly enabled.

Implemented on `feature/offline-core-v1`:

1. Browser local database (IndexedDB).
2. Stable per-device identity.
3. Customer local repository.
4. Durable outbox mutations with operation IDs.
5. Idempotent customer push synchronization.
6. Server monotonic pull cursor/change log.
7. Customer change capture for both offline sync writes and existing online writes.
8. Cached offline authorization snapshot with a seven-day revalidation window.
9. Client reconciliation engine for push, pull, retries, and basic conflicts.

Customers are the pilot entity. Financial, inventory, repair, purchase, and reporting modules remain server-authoritative until their dedicated phases.

## Invariants

- PostgreSQL/Supabase remains the server source of truth.
- Clients never receive database credentials.
- Every offline write carries a globally unique `operationId` and a stable `deviceId`.
- Server mutation processing is idempotent through `SyncMutation`.
- Existing `shopId` tenant boundaries are preserved.
- Existing `version` and `deletedAt` fields are used for optimistic conflict detection and tombstones.
- Client timestamps are informational only. Pull synchronization uses `SyncChange.sequence`, not device time.
- Offline permissions are cached authorization snapshots; membership/user management remains online-authoritative.
- Existing online customer writes are captured by a PostgreSQL trigger so offline devices do not miss changes made through the normal web UI.

## Local stores

### customers
Local customer projection used by offline UI.

### outbox
Durable business mutations waiting for server acknowledgement.

### meta
Sync cursor and cached offline session metadata.

## Server sync tables

### SyncDevice
Tracks the latest authenticated user associated with a device inside a shop and its last seen time.

### SyncMutation
Stores each `operationId` exactly once together with the authoritative result. Retries return the same result instead of re-applying the business operation.

### SyncChange
Monotonic server-side change sequence. Customer inserts and updates append a change row through a database trigger. The migration also backfills existing customers so a device starting at cursor `0` can bootstrap historical customer data.

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

New offline customers use one UUID as both the customer record ID and `clientGeneratedId`. Server customer version starts at `1`, and local optimistic versions advance after each queued edit so multiple edits from one offline device can be replayed sequentially.

## Sync API

Implemented endpoint:

- `GET /api/sync/v1/customers?cursor=...`
- `POST /api/sync/v1/customers`
- `GET /api/sync/v1/session`

Push behavior:

1. Authenticate the current server session and active membership.
2. Reject cross-shop/user spoofing.
3. Enforce customer mutation permissions and operational subscription status.
4. Deduplicate by `operationId`.
5. Apply customer mutations under a serializable transaction.
6. Enforce version conflicts and duplicate phone protection.
7. Preserve the existing linked-record restriction before deleting a customer.
8. Return applied/conflict/failed results plus authoritative records.

Pull behavior:

1. Return only the authenticated shop's customer changes.
2. Use a monotonic bigint sequence cursor.
3. Include soft-deleted customer tombstones.
4. Page at a maximum of 500 change rows.
5. Let the client retain pending optimistic data rather than overwriting it with an older pull projection.

## Offline auth

The existing HTTP session remains authoritative for online requests. After successful online validation, the client can cache a minimal local authorization snapshot containing user, shop, membership, permissions, issue time, and expiry. The current V1 expiry is seven days.

This snapshot is intentionally not trusted by the server. Every synchronized mutation is re-authenticated and re-authorized online. No password hashes, JWT secrets, or database credentials are stored in IndexedDB.

## Conflict behavior in V1

Customer updates and deletes use `baseVersion` optimistic concurrency. If another device changes the same customer first, the server returns `VERSION_CONFLICT` with the authoritative customer record. The local record is marked `conflict` and is not silently overwritten.

A richer conflict-resolution UI is still required before enabling local-first customer editing for general users.

## Rollout rule

Do not switch the existing customer screens to local-first reads/writes until:

1. The sync migration has been tested against a non-production PostgreSQL database.
2. TypeScript/build checks pass.
3. Airplane-mode customer create/update/delete tests pass.
4. Multi-device version-conflict tests pass.
5. Conflict-resolution UI is present.

No production database migration or Vercel deployment is part of this branch preparation step.
