# Customer and lead timeline

`crm.timeline_events` is a **derived projection**, not another business record
store. PostgreSQL triggers append/update timeline rows in the same transaction as
the source write. A projection failure rolls back the originating write rather
than silently creating a gap. Leads, customer/outlet links, lead stage and
assignment histories, activities, calls, and quotations remain authoritative.
Tenant and outlet references use `ON DELETE RESTRICT`; actor deletion nulls only
the actor reference. Subject/source IDs are polymorphic, so they intentionally
do not have cascading foreign keys: a source-row deletion must not erase the
timeline evidence.

## Supported events

| Event type | Source of truth |
| --- | --- |
| `customer_created` | `crm.customer_outlets` plus `crm.customers` |
| `lead_created` | `crm.leads` |
| `stage_changed` | `crm.lead_stage_history` |
| `lead_assigned` | `crm.lead_assignment_history` |
| `activity_created` | `crm.activities` |
| `activity_completed` | `crm.activities` while its current status is `DONE` |
| `call_logged` | `crm.calls`, when linked to a lead or customer |
| `quotation_created` | `crm.quotations`, when linked to a lead |

Linked lead events are projected to both the lead and its customer feed. Customer
creation rows are emitted once per customer/outlet link. Summaries omit names,
phone/email, descriptions, quote totals, and other financial/customer content.
Payloads contain only event metadata and the fields needed to interpret that
event.

`crm.tasks` and `crm.task_status_history` do not currently have a stable lead or
customer relationship. `crm.sales_orders` stores opaque `order_data` without a
customer/lead FK, and this schema has no payments table. These are intentionally
not inferred into a customer timeline; add supported event types only after a
reliable relation and its access rules exist.

## API and access

- `GET /api/v1/leads/:leadId/timeline?outletId=<uuid>&limit=50&cursor=<opaque>`
- `GET /api/v1/customers/:customerId/timeline?outletId=<uuid>&limit=50&cursor=<opaque>`

Both routes require PostgreSQL authentication, the corresponding `leads.read` or
`customers.read` permission in the requested outlet, tenant-scoped entity
existence, and the database outlet RLS policy. Page size is limited to 100.
Pages are ordered by `event_time DESC, id DESC`; the opaque cursor uses the last
returned pair as a keyset boundary, so ties do not skip or repeat rows.

The table is indexed for the per-entity/outlet feed and source-record
reconciliation. There is no evidence that this dataset requires time
partitioning yet; revisit only after measured table size, retention, and query
latency justify the operational cost.

## Backfill and correction

Run `SELECT crm.backfill_timeline_events('<tenant-uuid>');` in the database
context for that tenant. Use an authorized migration/operations connection that
can read each source row under RLS. Run tenant by tenant, monitor transaction
duration/locks, and retry as needed. The function upserts by tenant, subject,
source event, and outlet; it can safely overlap with live trigger writes. Its
return value is the number of source records replayed, not the number of
customer/lead projection rows.

Re-running the backfill refreshes mutable projection fields from current source
state. Calls, quotations, and activities also refresh their projection rows in
the source transaction when updated. Immutable stage/assignment history remains
the history source. Activity completion is represented while the current
activity is `DONE`; reopening it removes that derived completion row, and a
later completion can recreate it. No source rows are modified by the backfill.

## Rollback

Before rollback, stop timeline consumers and retain/export the projection if
operationally required. Run `backend/migrations/0040_timeline_rollback.sql` with
the database rollback command. It removes only timeline triggers, functions,
and the derived table; source business tables and their history are unchanged.
Re-apply migration `0040` and run the tenant-scoped backfill to reconstruct the
projection. Do not use rollback as a method of deleting source/audit records.
