# PostgreSQL Partitioning Assessment

**Assessment date:** 2026-10-09  
**Decision:** Do not partition any candidate at this time.

## Scope and evidence

The schema and query patterns were inspected in the repository. Exact counts,
relation sizes, indexes, RLS state, and non-executing `EXPLAIN` plans were read
from the PostgreSQL database configured for this workspace, in read-only
transactions. The database's deployment identity could not be independently
verified, so treat these as a snapshot of the configured target, not as
confirmed production metrics.

| Candidate | Exists in configured database? | Exact rows | Total relation size | Observed event/record time range |
| --- | --- | ---: | ---: | --- |
| `crm.user_tracking_history` | Yes | 24 | 114,688 bytes (112 KiB) | 2026-09-23 03:30–11:45 UTC (`recorded_at`) |
| `crm.attendance_events` | Yes | 148 | 212,992 bytes (208 KiB) | 2026-09-07 04:00–2026-09-23 12:42 UTC (`event_at`) |
| `crm.stock_ledger` | Yes | 0 | 40,960 bytes (40 KiB) | No rows |
| `crm.timeline_events` | **No** | Unavailable | Unavailable | Unavailable |

The timeline migration and implementation exist in the repository, but the
table is not present in the configured database. No runtime count, size, or
query plan can be reported for it.

No reliable growth rate is available. PostgreSQL table-statistics counters
were zero/unpopulated with no statistics reset timestamp, `pg_stat_statements`
was not installed, and Cloud SQL instance/Monitoring access was unavailable
(the active `gcloud` identity could not list instances). Current row timestamps
are a snapshot, not a defensible growth trend. Cloud SQL CPU, I/O, storage,
query-latency, and connection metrics therefore remain unavailable.

The `EXPLAIN` plans below were collected without `ANALYZE`; their costs and row
estimates are planner estimates, not measured elapsed time or buffer activity.

## Candidate assessments

### `crm.user_tracking_history`

1. **Rows and growth:** 24 exact rows; 112 KiB total. Current `recorded_at`
   values span about eight hours on 2026-09-23. A historical growth rate is
   unavailable.
2. **Queries and performance:** The API filters by tenant, outlet, user, and a
   `recorded_at` range, then keyset-paginates by `(recorded_at, id)` newest
   first. The live plan uses an index-only scan on
   `user_tracking_history_scope_recorded_idx`; it estimates one row. This
   existing index matches the demonstrated access pattern.
3. **Retention:** No tracking retention or archival policy was found. Location
   history is sensitive personal data; define a business/legal retention
   period and deletion behavior before considering time-based expiration.
4. **Future partitioning:** If measured growth and retention justify it, use
   monthly `RANGE (recorded_at)` partitions. Daily partitions are not justified
   by current evidence and would increase partition-management overhead.
5. **Keys and uniqueness:** The current primary key `(id)`, unique key
   `(tenant_id, id)`, and partial external-ingest deduplication key
   `(tenant_id, outlet_id, external_source, external_id)` do not include
   `recorded_at`. A partitioned unique/primary key must include the partition
   key. Adding `recorded_at` to the external key would no longer guarantee
   deduplication if a retry carries a corrected timestamp; retain global
   idempotency with a separate non-partitioned key registry or do not
   partition.
6. **FKs, ORM, RLS, and migration:** The table references tenants, outlets, user
   memberships, and creator users; outlet and membership deletion can cascade.
   RLS is enabled and forced. Partition queries through the parent must retain
   the policy; direct child-table access must not bypass it. Drizzle currently
   models an ordinary table, so partition DDL and schema-diff/migration behavior
   would need explicit validation. Check all inbound foreign keys before any
   key redesign.
7. **Partition operations:** Create monthly partitions ahead of time and alert
   before the next range is missing. A default partition can protect ingestion
   from a missed range, but alert on any rows landing there and move them before
   attaching the proper range partition.
8. **Backfill/cutover and rollback:** Build a partitioned shadow table, copy in
   bounded batches, validate counts, deduplication, RLS, grants, and FK behavior,
   then cut over with a tested write pause or another explicitly designed
   synchronization mechanism. Budget for duplicate table/index storage, WAL,
   replication lag, and additional disk headroom. Rollback requires a tested
   reverse copy and a verified recoverable backup.
9. **Benefit versus indexes:** Low. The current B-tree already supports the
   time-bounded user history query, and 24 rows provide no evidence of a scan
   bottleneck. Partitioning adds global-deduplication complexity and operational
   risk without a demonstrated query or retention benefit.

### `crm.attendance_events`

1. **Rows and growth:** 148 exact rows; 208 KiB total. Current `event_at`
   values span 2026-09-07 through 2026-09-23. A historical growth rate is
   unavailable.
2. **Queries and performance:** The backend currently inserts events with
   `ON CONFLICT ... DO NOTHING`; no application read from this table was found.
   The table has a `(tenant_id, outlet_id, user_id, event_at)` index, but there
   is no measured read bottleneck to address.
3. **Retention:** No event retention or archival policy was found. Attendance
   records may have employment, payroll, or audit retention obligations; do not
   drop historical ranges until those requirements are explicit.
4. **Future partitioning:** If sustained write volume or a defined retention
   policy later justifies it, use monthly `RANGE (event_at)`. Daily ranges need
   measured partition-size or maintenance evidence.
5. **Keys and uniqueness:** The primary key `(id)`, unique key `(tenant_id, id)`,
   and partial idempotency key `(tenant_id, device_id, external_event_id)` do
   not include `event_at`. Partitioning on event time cannot preserve these
   global uniqueness guarantees directly. In particular, moving event time
   into the idempotency key could allow a retried device event with a corrected
   timestamp to duplicate. Keep a global deduplication registry or leave the
   table unpartitioned.
6. **FKs, ORM, RLS, and migration:** The table has tenant, business, outlet,
   and user references, including cascade behavior for tenant/user deletion.
   RLS is enabled and forced. Parent-vs-child RLS access, grants, partition
   creation, ORM schema drift, and inbound foreign keys need explicit tests.
7. **Partition operations:** Pre-create monthly ranges; alert on missing future
   ranges and on rows accumulating in a default partition. Exercise late-arriving
   device events and retries across a partition boundary.
8. **Backfill/cutover and rollback:** A shadow-table migration must preserve
   device idempotency, enum types, FK checks, RLS, grants, indexes, and all
   existing event rows. Batch-copy and rehearse writes, disk/WAL headroom,
   cutover, and reverse-copy recovery in staging before any production approval.
9. **Benefit versus indexes:** Very low on current evidence. The API writes
   events and does not read them; partitioning would increase insert routing
   and index/constraint complexity without an established read or retention
   requirement.

### `crm.stock_ledger`

1. **Rows and growth:** 0 exact rows; 40 KiB total relation size. No data-backed
   growth rate or timestamp range can be measured.
2. **Queries and performance:** The repository lists the latest 50 rows by
   tenant and optional outlet, warehouse, or product. On this empty table, the
   non-executing plan chooses `stock_ledger_tenant_warehouse_idx`, filters by
   outlet, then sorts by `created_at`; the estimate is one row and provides no
   real latency evidence. The repository contains migration `0038` defining
   `stock_ledger_outlet_created_idx (tenant_id, outlet_id, created_at DESC)`,
   but that index is absent from the configured database. Confirm migration
   state and evaluate the intended index before considering partitioning.
3. **Retention:** No stock-ledger retention or archival policy was found. This
   is inventory audit history; deleting periods may affect reconciliation and
   must be approved against accounting and operational requirements.
4. **Future partitioning:** If measured ledger volume and retention justify it,
   use monthly `RANGE (created_at)`. Daily partitions are not supported by
   current evidence.
5. **Keys and uniqueness:** The primary key `(id)` and unique key
   `(tenant_id, id)` omit `created_at`. A partitioned primary/unique key must
   include it. Do not silently weaken global ID uniqueness; if required,
   retain a separate global ID registry or keep this ledger unpartitioned.
6. **FKs, ORM, RLS, and migration:** The ledger references tenant, warehouse,
   and product records with restrictive warehouse/product deletion behavior.
   RLS is enabled and forced. Validate all inbound references, parent and
   child permissions, ORM schema representation, and migration tooling. Ledger
   writes are coupled to inventory operations, so a missing partition must not
   break a business transaction.
7. **Partition operations:** Use pre-created monthly partitions and alert ahead
   of the next range. A default partition can avoid failed inventory writes,
   but must trigger an alert and be drained before creating an overlapping
   range.
8. **Backfill/cutover and rollback:** A cutover must preserve exact ledger
   contents and ordering, FKs, RLS, grants, all indexes, and transactional
   behavior with stock adjustments. Rehearse batch copy, WAL/disk headroom,
   write handling, and a reverse-copy restore in staging.
9. **Benefit versus indexes:** None shown. The table is empty. First ensure the
   existing outlet/time index migration is applied and measure the real
   list-stock-ledger query on representative staging data. A suitable B-tree
   index is simpler and avoids partition uniqueness and operational costs.

### `crm.timeline_events`

1. **Rows and growth:** The table is absent from the configured database, so
   count, size, growth, and time range are unavailable. Migration `0040` and
   the repository code define it in the codebase.
2. **Queries and performance:** The feed filters by tenant, outlet, entity
   type, and entity ID; it keyset-paginates and orders by `(event_time DESC,
   id DESC)`. The migration defines
   `(tenant_id, outlet_id, entity_type, entity_id, event_time DESC, id DESC)`,
   which matches that query. No live execution plan or latency data is
   available. The repository query has no explicit lower time bound, so
   partitioning may not prune old history for deep pagination.
3. **Retention:** No timeline retention policy was found. Although this is a
   derived projection and can be rebuilt from supported sources, source history
   and projection retention must be aligned before pruning events.
4. **Future partitioning:** Only if actual row growth, query plans, or retention
   operations justify it after migration, use monthly `RANGE (event_time)`.
   Daily partitions are not justified. Add a time lower bound only if product
   semantics permit limiting historical retrieval.
5. **Keys and uniqueness:** The declared primary key `(id)`, unique key
   `(tenant_id, id)`, and idempotency key
   `(tenant_id, entity_type, entity_id, idempotency_key)` omit `event_time`.
   The trigger/upsert uses that idempotency key. Partitioning would prevent
   enforcing the current unique key across partitions. Adding event time to the
   key could break retry/correction behavior; preserving global idempotency
   requires a registry or another tested design.
6. **FKs, ORM, RLS, and migration:** The migration has tenant/outlet FKs and a
   nullable actor FK with `ON DELETE SET NULL`; source entity IDs are
   polymorphic rather than FKs. RLS is enabled and forced in the migration.
   Triggers write timeline rows in the same transaction as source changes, so
   missing partitions can fail source writes unless a tested default-partition
   policy exists. Validate Drizzle schema parity, parent/child RLS, and trigger
   behavior before changing the table design.
7. **Partition operations:** Create monthly partitions before they are needed.
   Alert on missing ranges and on any default-partition rows. Reconcile and
   drain default rows before adding a matching range partition; alerting should
   cover the transactional trigger path.
8. **Backfill/cutover and rollback:** The timeline has a source backfill
   function, but it must be tested against a partitioned destination and
   idempotency constraints. Rehearse trigger writes, backfill retries, row
   counts, authorization, disk/WAL costs, cutover, and a reverse migration in
   staging. Do not rebuild or drop a production table without explicit approval
   and a verified recovery plan.
9. **Benefit versus indexes:** Not assessable at runtime because the table is
   not deployed in the configured database. The designed entity/time index
   already serves the primary feed pattern. Deploy and measure that design
   before introducing partitioning.

## Recommendation and evidence required to revisit

Keep all currently deployed candidates non-partitioned. In particular:

- Preserve the existing tracking index; it already supports its date-bounded
  query.
- For stock ledger, confirm whether migration `0038` is pending and evaluate
  its outlet/time index on representative data before further tuning.
- Do not partition attendance events without a demonstrated read, write, or
  retention problem.
- Deploy and measure the timeline projection before making a partition
  decision.

Revisit partitioning only after collecting a representative growth history and
Cloud SQL evidence (Query Insights or equivalent query latency, CPU, storage,
I/O, and connection metrics), validating `EXPLAIN (ANALYZE, BUFFERS)` on
representative **staging** data, and documenting retention and global-key
requirements. Any proposed implementation must include a staging cutover and
rollback rehearsal, verified backups, and explicit approval before production
changes.
