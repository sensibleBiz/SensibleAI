# Phase 13 — Billing Staging Release Gate

**Verdict: BLOCKED.** The billing database security/migration evidence is favorable for the currently configured local database, but the evidence does not establish staging readiness. No sandbox PhonePe transaction or webhook was exercised; staging secrets, business-approved conversion, a deployed reconciliation schedule, and recovery controls remain unverified or absent. Usage dispatch has known provider-success/database-failure gaps. The full backend suite and a public-route security assertion also remain unresolved.

This is an evidence report, not a production-readiness claim. No production payment endpoint was called and no migration was manually marked applied.

## 1. Database and migrations

The read-only `audit:billing-db` and `db:check-state` commands were run against the configured database, `sensible-database`. The journal has 47 entries and the database has 47 migration records with no pending entries. The final records have timestamps `1811100000000`, `1811200000000`, and `1811300000000`, corresponding to 0045, 0046, and 0047 respectively.

The live audit observed:

- All five billing tables (`rate_cards`, `top_up_orders`, `usage_events`, `wallet_transactions`, `wallets`) are owned by `sensible_rls_owner`, with both RLS and FORCE RLS enabled.
- Expected policies exist for rate-card administration, tenant/outlet-scoped top-ups, wallets, ledger transactions, and usage events. `billing.is_platform_admin()` is SECURITY DEFINER, owned by `sensible_rls_owner`, with `search_path=pg_catalog, pg_temp`.
- `sensible_app_role` has billing schema usage and rate-card INSERT/UPDATE privileges, but no DELETE privilege. `sensible_rls_owner` has billing schema usage.
- Constraints and indexes include positive/nonnegative checks, wallet/order/tenant coherence, unique order references, idempotency keys, provider order uniqueness, and wallet/status lookup indexes.
- No current wallets violate balance invariants; no top-up or usage rows violate their lifecycle coherence constraints.
- This database currently contains zero outlets and zero wallets, so the zero-outlet-without-wallet result does **not** exercise backfill coverage. The single active rate card prices only `whatsapp.template`.
- The runtime connection reports `sensible_crm_app`, a login role that is not superuser or BYPASSRLS, and is a member of `sensible_app_role`. The configured admin audit previously confirmed `crm_migrator` can terminate PostgreSQL backends and is a member of `pg_signal_backend`.

Source review found the platform-admin tenant context is set transaction-locally and the database helper rolls back/releases the connection on failure. The migration 0047 backfill runs transactionally under the RLS owner and uses `ON CONFLICT DO NOTHING`, making it safe to rerun without duplicate wallets. The local wallet-provisioning path also uses transactional provisioning.

**Limit:** this is evidence from the local configured database, not a staging database. In this invocation the disposable PostgreSQL migration rollback and wallet provisioning tests could not start because `DATABASE_ADMIN_URL` was unavailable to their test harness. The migration rollback test had passed 1/1 in the earlier recorded run after its transactional/RLS-owner correction; that does not replace a run against the designated staging-like disposable database. Do not deploy migrations until the disposable migration plan is rerun and the actual staging schema is independently audited.

## 2. PhonePe Standard Checkout v2

The implementation and contract note were compared with the official PhonePe Authorization, Create Payment, Order Status, and Webhook documentation. The adapter uses OAuth `client_credentials`, caches the server-only token until shortly before its `expires_at`, refreshes once after `401`, and sends the v2 create/status requests with bounded HTTP timeouts. Create uses `merchantOrderId`, paise amount, `expireAfter`, `PG_CHECKOUT`, and a redirect URL. Status is fetched server-to-server by `merchantOrderId`. The callback's configured SHA-256 username/password authorization is treated only as an authenticated trigger; status verification, amount/attempt checks, then the existing row-locked transaction are required for wallet credit.

Legacy PG v1 remains disabled with no fallback. Offline POS remains on its separate adapter and contract. Production initiation remains separately gated and requires production-specific credentials; the conversion rate is intentionally unset by default.

| Check | Result |
|---|---|
| Mocked OAuth success, failures, invalid credentials, token cache/expiry, refresh on 401 | Passed |
| Mocked v2 create request construction and status mapping (success/pending/failure/unknown) | Passed |
| Mocked one-retry status behavior and no automatic create retry after ambiguous timeout | Passed |
| Mocked valid/invalid webhook authentication and unsupported events | Passed |
| Mocked production fail-closed and legacy-v1 tripwire | Passed |
| Offline POS contract regression test | Passed |
| Lifecycle atomicity, server-side status authority, replay, and reconciliation | Passed in the focused lifecycle test |
| Actual sandbox OAuth/checkout/status/webhook, provider timeout recovery | **Not run** — valid sandbox credentials and dashboard access were not available |
| Actual concurrent callback, database failure/retry, and provider-delayed/out-of-order delivery | Mocked/lifecycle coverage only; no sandbox exercise |

Current configuration inspection (presence only; no secret values disclosed) found both top-up enable flags false and no sandbox OAuth credentials, sandbox webhook credentials, approved `PHONEPE_PG_CREDITS_PER_INR`, or `BILLING_PLATFORM_ADMIN_TENANT_ID`. Production credentials are absent as well. Do not enable staging top-ups until the missing configuration is supplied and verified through sandbox tests. The browser return remains non-authoritative: the client polls the server-side order status; a redirect alone never credits.

## 3. Reconciliation operations

`reconcileTopUpOrders` selects a bounded batch (default 50, capped at 500) of stale CREATED/PENDING orders and calls the same `verifyAndCreditTopUp` path used by callbacks/status checks. Repeated success is protected by the existing order lock and wallet ledger idempotency key. This is a runnable CLI (`npm run reconcile:topups`), not a deployed schedule: the repository's deployment configuration has no staging Cloud Run Job/Cloud Scheduler setup.

Recovery is not operationally complete:

- No durable per-order retry counter, bounded exponential backoff, retry ceiling, or dead-letter/terminal-reconciliation state exists.
- A failed attempt does not durably advance `updated_at`; repeatedly failing oldest rows can starve later stale orders.
- The worker returns errors and emits sanitized error codes/run counts, but no durable operator queue, alert wiring, or authenticated recovery operation is configured.
- Failed orders are excluded from stale reconciliation. There is no documented operator-safe recovery workflow for exhausted or persistently ambiguous orders.

**Required infrastructure task:** provision a private staging Cloud Run Job (or equivalent) invoking the bounded command on Cloud Scheduler with OIDC, least-privilege database access, secrets from the staging secret store, structured metrics/alerts for failures and backlog age, and runbook access. Before relying on it for payment recovery, implement and test durable retry/backoff and observable exhausted/dead-letter state without issuing another payment create for ambiguous orders.

## 4. Usage metering and recovery

External provider operations and database billing transactions do not share an atomic transaction. `usageService.meterUsage` atomically writes the usage event, debits, and marks it BILLED when it is called inside its database transaction, but this cannot make the preceding/following provider operation atomic.

| Channel | External boundary and local state | Idempotency/debit timing | Recovery and risk |
|---|---|---|---|
| WhatsApp | MSG91 send occurs before durable message append and billing; no durable pre-dispatch operation/outbox record | No persisted provider-operation key before send; debit follows provider call | Provider success plus DB/debit failure loses durable local evidence; ambiguous timeout can be treated as failure and a retry can dispatch twice. No reconciler closes the gap. |
| AI | Google ADK/model call precedes usage debit; usage UUID is created after model completion | No durable reservation before call; debit after model operation | Billing/commit failure leaves no durable recovery record; retries can repeat model work and usage. No reconciler for this boundary. |
| SES | SES send precedes a separate DB metering transaction; SES MessageId is available after send | MessageId is used for metering, but no durable operation/outbox exists before send; billing failure is logged while send returns success | Client retry can send duplicate email; a billing failure has no durable operator recovery record. External success and DB commit are not atomic. |

No cross-channel fix was made: a safe outbox/reservation design requires channel-specific provider idempotency and product decisions beyond a verified surgical staging correction. Staging approval should either exclude these dispatch/billing paths or require a separately reviewed durable operation ledger and reconciliation design first.

## 5. Test and build evidence

Latest focused results:

- Backend PhonePe unit plus top-up lifecycle: **13/13 passed**.
- Frontend billing tests: **55/55 passed**.
- ESLint on the changed billing page/types: **passed**.
- Backend TypeScript typecheck (`tsc --noEmit` and scripts config): **passed**.
- Backend build: **passed**.
- Frontend Vite build: **passed earlier**, with a chunk-size warning.
- Migration rollback and wallet provisioning integration tests: **not run in this invocation**, because `DATABASE_ADMIN_URL` was unavailable to the test harness. Migration rollback passed 1/1 in the earlier recorded disposable-DB run. Wallet provisioning remains blocked on admin role/ownership permissions; do not weaken FORCE RLS to work around this.

The last full backend run with local dotenv values loaded was **194 passed, 50 failed, 0 skipped out of 244**. Do not treat these failures as one category or a green suite:

- **Unresolved security assertion:** the `auth-negative` test flags `/api/v1/quick-contacts` as a P0 public-route issue. The route is registered before `requirePostgresAuth`, and its controller uses caller-supplied outlet context. It may be an intended public pamphlet lead endpoint, but requires explicit security/product disposition and abuse/privacy controls before staging.
- **Test infrastructure/environment:** PostgreSQL wallet tests could not assume the required admin role membership/ownership needed for their `SET ROLE` and fixture database operations. The standalone migration tests also need `DATABASE_ADMIN_URL` loaded. This differs from the confirmed `pg_terminate_backend` permission, which exists.
- **Test infrastructure/environment:** whole-schema fixture rebuild failed RLS while seeding `business_pipeline_stages`.
- **Existing unrelated defects or stale tests, not yet resolved individually:** missing legacy modules/source paths and stale expected-message/assertion mismatches. Each of the 50 failures must be mapped to its concrete test and code before it can be signed off; this report does not claim all are harmless.

The new ambiguous-order replay route test was included in the 13/13 passing lifecycle run. No failures were suppressed, skipped, or weakened.

## 6. Staging configuration gates

Presence check was performed without displaying secret values. The current local configuration is not staging configuration.

| Gate | Current evidence | Staging requirement |
|---|---|---|
| Platform-admin tenant | `BILLING_PLATFORM_ADMIN_TENANT_ID` absent; admin rate-card mutations fail closed | Configure the approved internal tenant UUID; verify the admin security test using the staging role |
| Migration state | Local database 47/47; staging unknown | Audit staging journal/schema; validate migrations on a disposable clone before applying |
| PhonePe environment and credentials | Top-ups disabled; sandbox credentials absent; production config absent | Sandbox-only client ID/secret/version and dashboard access in staging secret store |
| Webhook | Sandbox webhook credentials and public staging webhook URL absent | HTTPS staging callback configured in PhonePe sandbox dashboard, matching SHA auth credentials; verify a real delivery |
| Top-up enablement | `PHONEPE_PG_ENABLED=false` | Leave false until contract checks and conversion are approved; then enable only for the sandbox staging service |
| Conversion | `PHONEPE_PG_CREDITS_PER_INR` absent | Obtain written business-approved credits-per-INR; do not invent a value |
| App/admin database roles | Local app identity is non-superuser/non-BYPASSRLS; staging connectivity/privileges unknown | Verify staging app/admin roles, transaction-local context, grants, and connection pool separation |
| Reconciliation | CLI only; no scheduler/job configuration | Provision private scheduled job, alerts, durable bounded retry/dead-letter, and operator runbook |
| Pricing/monitoring | Local DB has only one active `whatsapp.template` rate card; staging rates/alerts unknown | Load approved rate cards and verify billing metrics, payment backlog alerts, audit access, and on-call ownership |
| Deployment isolation | Existing workflow deploys `main` to a production-named Cloud Run service; no staging target was found | Create/use a separate staging service, project/database/secrets, and explicit approval gate; never repoint this workflow casually |

## 7. Phase 13 code changes in this work

Changes from the readiness-audit segment:

- `backend/src/modules/billing/topUp.types.ts`, `topUp.service.ts`, `phonePePg.routes.ts`, and `topUpReconciliation.ts`: preserve a replayed pending order without creating another provider payment; use the existing authoritative verification/credit path and reduce payment-detail exposure in errors/logs.
- `backend/src/modules/billing/wallet.service.ts`: remove sensitive amount/balance details from top-up credit logs.
- `backend/tests/integration/topUp.lifecycle.integration.test.ts`: route-level coverage for ambiguous pending-order replay.
- `backend/tests/integration/billingMigrations.rollback.integration.test.ts`: run the backfill transactionally and inspect with RLS-owner context.
- `src/features/billing/types/billing.types.ts` and `src/features/billing/pages/TopUp.tsx`: retain the idempotency key across retries and poll server status when replaying an existing order.
- `docs/phase-13-billing-staging-release-gate.md`: this audit evidence and release decision.

The worktree contains other existing changes from earlier phases and unrelated work. They are not part of this Phase 13 list and were not reverted.

## 8. Staging deployment and rollback

**Do not deploy yet.** Once all blocking prerequisites are resolved:

1. Create an isolated staging project/service/database and a least-privilege staging app role; store sandbox-only PhonePe and database credentials in the staging secret manager.
2. Validate all pending migrations against a disposable clone, including 0045–0047, FORCE RLS, grants, policies, backfill, and rollback behavior. Snapshot the staging database and run read-only migration/security audits before and after applying the reviewed migration set. Do not edit the migration journal manually.
3. Configure the approved internal platform-admin tenant and business-approved conversion/rate cards. Keep production flags and all production PhonePe secrets absent from staging.
4. Deploy a staging-only application artifact with `PHONEPE_PG_PRODUCTION_ENABLED=false` and `PHONEPE_PG_ENABLED=false`. Validate authenticated wallet APIs and ensure Offline POS configuration remains independent.
5. Before enabling sandbox initiation, configure the sandbox callback URL/auth in PhonePe dashboard, add durable reconciliation retries/alerts, disposition the quick-contact security finding, and run the required real sandbox cases. Enable sandbox top-ups only for the isolated staging service.
6. Observe webhook, payment/order backlog, retry/dead-letter, wallet ledger, and usage-metering alerts through the agreed soak period. Verify repeated callbacks and operator recovery do not create duplicate credits.

**Rollback:** immediately set `PHONEPE_PG_ENABLED=false` for the staging service and redeploy/restart it; revoke or disable sandbox credentials if needed. Roll the application back to the previous staging artifact while preserving the database and all order/ledger history. Do not reverse 0045–0047 automatically or delete ambiguous/failed orders. Keep reconciliation access available for already-created orders, and use the documented operator process to verify/refund/resolve them. Database rollback requires a separately reviewed, backed-up migration plan after confirming no dependent application or payment data remains.

## 9. Production-only prerequisites

Production remains disabled and is outside this staging approval. Before any production launch: obtain PhonePe production credentials and dashboard approval; validate production OAuth/payment/webhook configuration in a controlled release; approve and independently reconcile the credit conversion; complete sandbox soak and security disposition; deploy a private durable reconciler with alerting and operator runbooks; resolve dispatch/metering recovery risks; pass backend test/security gates; review production role grants, backup/restore, incident response, and rollback; and obtain explicit business, finance, security, and release approval. Never reuse Offline POS credentials for PG.
