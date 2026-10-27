# Cloud SQL PostgreSQL Read Replica Assessment

**Assessment date:** 2026-10-09  
**Decision:** Do not provision a read replica or change application routing based
on the evidence currently available.

## Evidence and limitations

The PostgreSQL connection configured in this workspace reported PostgreSQL
18.6, a database size of 17,905,343 bytes (about 17.1 MiB), `max_connections`
of 100, and one connection when inspected. The connected server reported
`pg_is_in_recovery() = false`, so this target was a primary, not a replica.
Its deployment identity could not be independently verified; do not treat
these figures as confirmed Cloud SQL production metrics.

The database activity counters showed 14 commits, 3 rollbacks, 385 shared
block reads, and 8,393 shared block hits at inspection time, with
`pg_stat_database.stats_reset` unset. Table statistics were unpopulated or
very small. These counters have no usable observation window and include the
assessment's own queries. They cannot support a workload read/write ratio,
CPU estimate, slow-query distribution, cache-hit trend, or sustained
connection-demand estimate.

Cloud SQL instance configuration and Cloud Monitoring metrics were unavailable
to the active `gcloud` identity. Consequently, machine tier, configured disk
capacity/usage, CPU, I/O, storage growth, Query Insights latency, replication
lag, and the incremental replica cost are unknown. `pg_stat_statements` was
not installed, so query-level execution counts and timings were unavailable.

The backend logs transactions exceeding a configurable threshold (default
2,000 ms), but the warning is not tagged with a route/query name and does not
measure DB CPU. This is useful as an alert signal, not a substitute for
Query Insights or request/query-level instrumentation.

## Findings and decisions

### 1. Optimize and measure before a replica

Yes. The present evidence does not show primary saturation or read-driven
contention. Several targeted steps should precede a replica:

- Enable/inspect Cloud SQL Query Insights and collect CPU, memory, disk, I/O,
  connection utilization, query latency, and read/write workload metrics over
  representative peak and off-peak periods.
- Add route/query identifiers and durations to slow-transaction telemetry
  without logging tenant-sensitive SQL parameters. Record pool wait time and
  connection saturation as well.
- Review dashboard aggregation. Lead report repository methods currently
  fetch up to 5,001 raw lead rows, reject over 5,000, and aggregate results in
  application code. Conditional SQL aggregation could reduce transferred rows
  and application work; validate result equivalence, RLS, and query plans with
  representative staging data first.
- Compare query plans and existing indexes against actual production query
  shapes; tune indexes only where evidence justifies them.
- No backend CSV/XLSX/attachment export endpoint was found in the inspected
  routes/services. Confirm whether exports are performed elsewhere before
  treating exports as a replica workload.
- Review analytics cache hit rate and workload concurrency; the assistant's
  read-only analytics tools already use a 30-second in-process cache.

### 2–3. Read-only endpoint candidates and consistency tolerance

All current database handlers use authenticated transaction context. A
replica is not a transparent replacement for that path. If future metrics
justify a replica, consider routing only explicitly designated, read-only
analytics after product owners confirm that short-lived staleness is acceptable.

| Endpoint/workload | Candidate? | Replication-lag and authorization considerations |
| --- | --- | --- |
| Lead dashboard and `/leads/reports/*` (`/reports/employees`, `/source`, `/city-state`, `/funnel`, `/stage-counts`) | **Potentially, after validation.** These are the clearest replica candidates if users accept slightly stale aggregates. | The current report service checks `lead_reports.read` in the same database transaction before loading results. A replica can lag permission grants/revocations and source changes. Do not route authorization/revocation-sensitive reads to it unless the authorization decision and RLS semantics have an explicit freshness design. |
| Assistant aggregate tools (stage/ageing/salesperson/source summaries) | **Potentially, after validation.** Existing 30-second cache already reduces some repeat reads. | Confirm user-facing staleness behavior, and keep permission checks fresh. Do not send sensitive or tenant-crossing data to a replica context lacking the same RLS settings. |
| Lead/customer timeline feeds | **Not by default.** Users commonly expect just-created activities, calls, and changes to appear immediately. | Read-after-write is common; route to primary unless the caller explicitly opts into eventual consistency or the product accepts a documented lag. |
| Lead/customer detail, list, search, enquiries, assignments and task/activity updates | **No by default.** These are interactive CRM workflows with read-after-write expectations. | Keep reads following a mutation on primary. Stale ownership, status, access assignments, or customer details can mislead users or affect subsequent action. |
| User tracking history | **Potentially only for historical browsing.** | Live/near-live location is freshness-sensitive. Route recent/current-location views to primary; a date-bounded historical view could tolerate lag only after the UI and product contract say so. |
| Payroll, attendance, stock, payment/accounting, and audit views | **No without domain-specific signoff.** | Pay calculations, time clocks, inventory balances, and audit workflows need explicit consistency and legal/operational requirements; do not infer staleness tolerance. |
| Bulk exports | No backend export route found in inspected code. | If introduced, an async snapshot/export design or replica could be considered, but define point-in-time and lag semantics first. |

The transaction context currently obtains a permission check and protected data
within one transaction. Moving an endpoint wholesale to a replica also moves
its authorization reads to potentially lagging IAM and access-control rows.
Permission revocations must not become a stale-read data disclosure. Until a
fresh authorization strategy is designed and tested, sensitive endpoints stay
on primary even if their payload is read-only.

### 4–5. Connection identity and read-after-write

The application currently creates one `pg` pool from `DATABASE_URL`. A future
implementation, if approved, should use distinct primary and replica
connection settings and pools with distinct `application_name` labels, health
checks, bounded pool sizes, and explicit route-level pool selection.

Do not infer replica eligibility from SQL text, HTTP `GET`, or a generic
read-only transaction. Keep writes and transactions that may write on primary.
Keep a request's writes and subsequent read-after-write operations pinned to
primary. A safe initial route allowlist would be limited to explicitly approved
analytics and must default to primary when the flag is disabled.

Replica routing should be feature-flagged and observable. The replica pool must
not be used as a fallback-free hidden behavior change: if unavailable, either
return a clear error for replica-only asynchronous/reporting work or make a
deliberate, monitored primary fallback only after confirming primary headroom.
Protect the primary from failover load amplification with bounded concurrency,
timeouts, circuit breaking, and alerts.

### 6. Failover, operations, and cost

A replica adds instance/storage cost and operational complexity; costs cannot
be estimated without the Cloud SQL tier, region, disk configuration, HA mode,
and pricing inputs. It also consumes connections. Current backend pool defaults
are five connections per process, configurable with `DB_POOL_MAX`; a second
pool must be budgeted across maximum Cloud Run instances and compared with
primary and replica connection limits.

Operational readiness would require monitoring and alerting for replica
availability, replication lag, replay delay, CPU, disk, I/O, connections, and
query latency. Decide whether lag spikes cause primary fallback, request
failure, or a stale-data response. Failover promotion and endpoint/connection
changes need a tested runbook. A replica is not a backup or a replacement for
verified backups and point-in-time recovery.

### 7. RLS and tenant authorization

`withDatabaseContext` begins a transaction and sets tenant, user, and
super-admin values with transaction-local `set_config(..., true)` before
running the operation; it rolls back on errors. The pool also resets those
values on newly opened connections. A replica-bound transaction must use the
same mechanism on its own checked-out connection; never copy session state
between pooled clients or issue protected queries outside the scoped
transaction.

The role check currently validates only the pool created from `DATABASE_URL`.
A future replica pool needs its own role validation: non-superuser,
non-`BYPASSRLS`, membership in the intended application role, and effective
permissions/RLS policies verified on the replica. Test cross-tenant denial,
outlet scoping, revoked permissions, transaction rollback, and pool reuse
against the replica before enabling a route.

Because logical/physical replication lag includes access-control changes, RLS
alone does not guarantee immediate revocation on a replica. Until authorization
freshness is independently guaranteed, retain sensitive reads on primary.

## Recommendation and reconsideration gate

Do not create a replica or change production routing. First collect a valid
Cloud SQL workload baseline over representative traffic, optimize the
dashboard/report path where plans support it, and document export workloads
and consistency expectations.

Reconsider only if measured, sustained read load materially contributes to
primary CPU/I/O/latency or blocks writes after optimization, and if:

1. A bounded list of endpoints has documented lag tolerance and no
   read-after-write dependency.
2. Fresh authorization is preserved despite replication delay.
3. Staging tests cover route selection, consistency, RLS, pool isolation,
   connection budgets, replica outages, failover, and controlled fallback.
4. Cloud SQL cost, capacity, monitoring, and on-call procedures are approved.

Any future implementation should be behind configuration flags, default to
primary, include explicit rollback instructions, and receive separate
production approval.
