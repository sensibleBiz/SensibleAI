# Phase B1 — PostgreSQL Customer Foundation

New PostgreSQL Customer operations use `crm.customers`, `crm.customer_outlets`, and
`crm.customer_identities` through `PostgresCustomerService` and
`PostgresCustomerRepository`. Requests are selected explicitly with the PostgreSQL
session boundary and run inside the Phase A tenant/user transaction context and RLS.

The repository boundary is:

```text
Customer service boundary
├── PostgresCustomerRepository       new/cutover Customer data
└── LegacyFirestoreCustomerRepository existing legacy Customer data
```

The Firestore collections remain legacy and untouched. Phase B1 performs no migration,
backfill, ETL, synchronization, or Firestore document modification. PostgreSQL and
Firestore result sets are never combined.

The existing Firestore Lead-to-WON transaction remains unchanged. Phase B2 must move
Lead creation and stage transitions to PostgreSQL, then call the PostgreSQL Customer
service inside the same transaction to create/reuse a Customer, attach the Lead, and
update lifecycle counters.
