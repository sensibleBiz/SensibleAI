# Phase 11 billing production-readiness report

Date: 2026-10-10  
Release target: verified internal staging readiness  
Verdict: **NOT READY**

The wallet ledger, RLS controls, rate-card authorization, top-up finalization, and rollback behavior pass the focused disposable-PostgreSQL suite. The original audit found the configured database at 44 of 47 migrations. A post-audit follow-up below records successful application and verification of all 47 migrations. The deployment remains not ready for internal staging: there are no active rate cards or configured platform-admin tenant; PhonePe v2 has not been sandbox-certified and top-ups remain gated; reconciliation is not scheduled; and WhatsApp, AI, and SES still have unresolved dispatch-versus-billing recovery gaps. The repository-wide frontend build and backend test suite also have unrelated baseline failures.

No production payment endpoint or real-money transaction was used. No PhonePe endpoint was called.

## What was verified

### Database and RLS

The configured database was inspected read-only with `npm run audit:billing-db`.

- The application login is a login-capable, inheriting member of `sensible_app_role`; it is neither superuser nor `BYPASSRLS`.
- `sensible_app_role` is non-superuser, non-`BYPASSRLS`, and `NOLOGIN`.
- All five billing tables are owned by the non-login `sensible_rls_owner` role and have both RLS and FORCE RLS enabled.
- The live database is at 44 migrations while the journal contains 47. Migrations 0045-0047 are pending.
- The live database therefore has no `billing.is_platform_admin()` function or application rate-card write grants. This is fail-closed, but is not the intended staging schema.
- The live database has 0 outlets, 0 wallets, 0 active rate cards, and 0 priced service types. The checked wallet, top-up, and usage coherence queries returned 0 invalid rows, but there is no live billing data to exercise.
- The older applied 0044 did not give `sensible_rls_owner` schema USAGE. Pending 0046 and 0047 both repair that grant so an already-migrated environment is corrected.

On disposable databases, tests verified that:

- ordinary users and ordinary tenant administrators cannot mutate global rate cards;
- only a tenant administrator belonging to the server-configured platform tenant can mutate them;
- missing platform-admin configuration fails closed;
- the security-definer function is owned by the trusted owner, uses `search_path=pg_catalog,pg_temp`, has no dynamic SQL, denies PUBLIC execute, and explicitly grants only the app role;
- `app.is_platform_admin` is transaction-local and is cleared after both COMMIT and ROLLBACK, including pooled-client reuse;
- rate-card reads remain available to authenticated application users;
- deactivation preserves immutable pricing fields and referenced historical rates cannot be deleted;
- insufficient balance, concurrent debits, idempotent credits/debits, ledger rollback, and tenant isolation behave atomically.

### Top-up lifecycle

Credential-independent integration tests used a mocked provider and a real disposable PostgreSQL database. They proved:

- concurrent confirmations mint credits once;
- the browser return is not sufficient to credit a wallet;
- success requires trusted server-side status, matching merchant order ID, exact paise amount, and a provider transaction ID;
- mismatched amounts stay uncredited;
- callbacks only trigger server-side verification and cannot directly credit from callback data;
- duplicate/replayed confirmations are idempotent;
- a trusted later success can recover an out-of-order earlier failure;
- stale pending orders expire locally;
- payment HTTP calls are outside database transactions;
- final order lock, ledger credit, and SUCCESS transition are atomic.

### PhonePe contract comparison

The repository adapter uses legacy `/pg/v1/pay` and `/pg/v1/status` requests with salt-key `X-VERIFY`. Current PhonePe Standard Checkout documentation uses OAuth authorization and v2 checkout endpoints: an OAuth token, `POST /checkout/v2/pay`, and `GET /checkout/v2/order/{merchantOrderId}/status`. Current webhook configuration is dashboard-based and supports HMAC or SHA-256 username/password verification; duplicates must be handled idempotently.

Sources:

- [PhonePe OAuth authorization](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/authorization)
- [PhonePe create-payment API](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/create-payment)
- [PhonePe order-status API](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/order-status)
- [PhonePe webhook reference](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/webhook)
- [Official PhonePe Node SDK](https://github.com/PhonePe/phonepe-pg-sdk-node)

The legacy adapter is now behind `PHONEPE_PG_LEGACY_V1_ENABLED=false` by default and is unconditionally rejected in production. This is a safety gate, not a completed v2 integration. Real PhonePe sandbox initiation, callback, status, retry, and crash-recovery tests were **not run** because current sandbox OAuth credentials/account contract are unavailable and the adapter does not implement the current contract.

## Defects remediated

- Added strict UUID parsing for `BILLING_PLATFORM_ADMIN_TENANT_ID` and a default-off legacy PhonePe gate.
- Kept privilege GUCs transaction-local and removed an unsafe asynchronous pool-connect reset that could race the first borrower.
- Hardened 0046's security-definer ownership, search path, execute privileges, and temporary schema grants; made its rollback fail closed.
- Added 0047 to backfill one zero-balance INR wallet per existing outlet; its rollback intentionally never deletes financial records. The backfill runs as `sensible_rls_owner` inside the migration transaction because the cross-tenant insert cannot satisfy the tenant-scoped wallet policy under FORCE RLS.
- Provisioned a wallet in the same transaction as new outlet creation.
- Fixed an ambiguous transaction-history query.
- Refactored top-up verification so provider HTTP is outside database transactions and finalization is locked and atomic.
- Added exact provider identity/amount checks, bounded HTTP timeouts, non-2xx rejection, local expiry, failure recovery, and retry-safe webhook behavior.
- Added a bounded reconciliation command with per-order isolation and safe summary logging.
- Added a read-only live database billing audit.
- Added disposable PostgreSQL tests for top-up concurrency/idempotency and migration rollback/reapply behavior.
- Repaired billing fixtures so integration tests use disposable databases rather than the configured database.
- Updated the full migration-count assertion from 44 to 47 and repaired affected WhatsApp/onboarding/PhonePe test coverage.

### Migration 0047 RLS backfill follow-up

An application of 0047 as the non-bypass migration login failed when its cross-tenant wallet insert was checked against the `wallets_insert` policy. Setting `app.is_super_admin` does not grant an exception to that policy. The migration now temporarily switches to the trusted `sensible_rls_owner` role for the backfill, then resets the role before the transaction ends; no RLS policy was weakened. A dedicated disposable-PostgreSQL regression verifies the migration as a non-superuser, non-BYPASSRLS login against an outlet with FORCE RLS enabled, and checks both zero-INR wallet creation and idempotent reapplication.

The reported failed Drizzle migration was transactional, so its 0047 transaction (including the migration journal write) rolled back. After deploying this correction, check the applied migration state and rerun `npm run db:migrate`; do not manually insert or delete financial records.

The operator subsequently confirmed the database had 44 applied migrations and three pending, then successfully ran `npm run db:migrate`. Follow-up `npm run db:check-state` verified **47 applied, 47 expected, 0 pending**. The read-only `npm run audit:billing-db` also confirmed all five billing tables are owned by `sensible_rls_owner` with RLS and FORCE RLS enabled; `sensible_rls_owner` has billing schema USAGE; `billing.is_platform_admin()` exists; rate-card INSERT/UPDATE grants are present and DELETE is absent; and wallet, top-up, and usage invariants report zero violations.

The audit reports 0 outlets and 0 wallets, so the production database contained no existing outlet rows for 0047 to backfill; the actual-outlet backfill behavior is covered by the disposable PostgreSQL regression. There are also still 0 active rate cards and no approved `PHONEPE_PG_CREDITS_PER_INR`; successful migrations do not enable top-ups or make the environment production-ready.

Files changed for this verification, grouped by purpose:

- Configuration and runtime safety: `backend/.env.example`, `backend/src/config/env.ts`, and `backend/src/db/client.ts` document/validate the new gates and keep privilege context transaction-local.
- Schema and rollback safety: `backend/migrations/0044_billing_schema.sql`, both 0046 files, both 0047 files, and `backend/migrations/meta/_journal.json` repair owner access, harden platform-admin RLS, backfill wallets, and preserve financial rows on rollback.
- Wallet/onboarding: `backend/src/modules/outlets/postgresOutlet.service.ts` provisions wallets atomically; `backend/src/modules/billing/billing.repository.ts` fixes qualified transaction-history reads.
- Top-ups: `phonePePg.service.ts`, `topUp.repository.ts`, `topUp.service.ts`, `phonePePg.routes.ts`, and `topUpReconciliation.ts` under `backend/src/modules/billing/` implement the legacy safety gate, trusted verification, atomic finalization, expiry/recovery, and bounded reconciliation.
- Operations: `backend/scripts/reconcile-topups.ts`, `backend/scripts/audit-billing-database.ts`, and `backend/package.json` add runnable reconciliation/audit commands.
- Metering regression support: `backend/src/modules/whatsapp/postgresWhatsApp.service.ts` makes the existing billing dependency testable; `backend/src/modules/assistant/crmAssistant.service.ts` removes a no-op error wrapper without changing fail-closed billing behavior.
- Tests: the focused billing integration files, `backend/tests/integration/postgres.integration.test.ts`, `backend/tests/outlet-onboarding.test.ts`, `backend/tests/whatsapp-postgres-chat.test.ts`, and `backend/tests/unit/phonePePg.unit.test.ts` add/fix disposable-DB, migration-count, provisioning, metering, and provider-boundary coverage.
- Frontend/report: `src/features/billing/pages/PaymentReturn.tsx` removes an unused import, and this report records the evidence and release gates.

## Security and correctness findings

### High

1. **Current PhonePe contract is obsolete.** The v1 adapter is incompatible with the currently documented OAuth/v2 flow. Mitigation: it is disabled by default and always disabled in production. Required fix: implement and sandbox-certify v2 before enabling top-ups.
2. **WhatsApp dispatch is not reservation-safe.** It performs a non-binding wallet existence check, holds the request transaction across provider dispatch, and creates a fresh server UUID per retry. Concurrent spend can make the later debit fail after dispatch; a client retry can dispatch and charge again. A safe fix requires a durable client idempotency key/send intent plus reserve-capture-release states and explicit handling of ambiguous timeouts. Do not enable billable WhatsApp in staging until this exists.
3. **AI usage is not retry-idempotent and crosses an external-call transaction boundary.** Each request generates a new billing UUID and the model call occurs inside the request database transaction. A network retry can invoke/bill twice, while a post-provider billing failure consumes provider capacity without a durable recovery record.
4. **SES billing is optional and not durable.** An authenticated caller can omit `outletId`; when it is supplied, a post-send billing failure only emits `EMAIL_BILLING_FAILED_AFTER_SEND`. There is no durable pending usage record or reconciler.
5. **The configured database is behind the required schema.** It has 44/47 migrations and cannot provide the tested platform-admin/write and wallet-backfill behavior.

### Medium

1. **Reconciliation is runnable but unscheduled and has no durable retry ceiling.** It has a bounded batch, a five-minute default retry spacing, provider timeouts, and per-order isolation, but no attempt counter/dead-letter state or exponential backoff. No Cloud Run Job/Cloud Scheduler definition or alert policy exists in the repository.
2. **Business billing configuration is incomplete.** There are no active rates and `PHONEPE_PG_CREDITS_PER_INR` remains unset. Following operator confirmation, the local development backend now identifies the approved platform tenant through `BILLING_PLATFORM_ADMIN_TENANT_ID`; this local setting does not configure deployed environments. The unset conversion rate intentionally keeps top-ups disabled; no conversion or prices were invented.
3. **CI cannot reproduce the database evidence as configured.** The deploy workflow runs `npm test` without provisioning PostgreSQL/pgvector or injecting `DATABASE_ADMIN_URL`. Security tests must fail or be reported blocked when that URL is unavailable; they must not be silently counted as passes.
4. **Operational alerts are missing.** Required alerts include stuck CREATED/PENDING orders, reconciliation failures, repeated provider errors, `EMAIL_BILLING_FAILED_AFTER_SEND`, insufficient credits, low balances, usage idempotency conflicts, and migration-count drift.

### Low / informational

- The app-level platform-admin rule is tenant-admin membership in one configured platform tenant, not a separate named user. This matches the current design but should receive explicit business/security approval.
- Migration 0044 rollback destroys the billing schema and financial history. It is suitable only for an empty/disposable environment, never routine production rollback.

## Test evidence

Final focused evidence:

- Billing/security disposable PostgreSQL suite: **22 passed, 0 failed, 0 skipped**.
- Targeted outlet, PhonePe, and WhatsApp unit/regression tests: **29 passed, 0 failed, 0 skipped**.
- Frontend billing tests: **55 passed, 0 failed, 0 skipped**.
- Backend TypeScript check: **passed**.
- Backend production build: **passed**.
- Drizzle migration consistency check: **passed**.
- Phase 11 targeted ESLint run: **passed**.
- Read-only configured-database audit: **completed**; it reported the 44/47 and zero-rate blockers above.
- Live migration-state check: **failed closed as designed**, reporting 44 applied, 47 expected, and 3 pending.

Harness setup attempts, not counted as passes:

- The first combined billing invocation reported **17 passed, 1 failed, 4 skipped** because the test process had not preloaded `DATABASE_ADMIN_URL`. This correctly demonstrated that the skipped suites could not be used as evidence.
- A second invocation reported **1 passed, 7 failed, 0 skipped** because `.env` incorrectly overrode `.env.local-private` and selected the PostgreSQL instance without pgvector. The final invocation used the application's real dotenv precedence and produced the 22/22 result above.

Repository-wide regression status:

- Full backend suite (serialized): **204 passed, 47 failed, 0 skipped** across 251 tests. Failures include legacy missing-module tests, known security assertions, and a clean-schema business-pipeline trigger failure. The focused billing suite passes when run alone; a highly concurrent whole-suite run also caused disposable-database cleanup contention, so the final focused evidence was rerun and cleaned.
- Standalone clean-schema `postgres.integration.test.ts`: **0 passed, 1 failed, 0 skipped** after the corrected 47-migration assertion, at the unrelated `business_pipeline_stages` RLS seed trigger.
- Root TypeScript/build: **failed** on unrelated employee-target, missing export sample-data, and sales-order modules. The Phase 11 `PaymentReturn` unused import was fixed.
- Repository-wide ESLint: **failed with 44 errors and 1 warning**; the Phase 11 targeted set passes.

Not run / blocked:

- Real PhonePe sandbox E2E: blocked by missing OAuth/v2 implementation and sandbox credentials/account contract.
- Real MSG91, Google AI, and SES billing recovery tests: not run; the required durable dispatch/recovery designs do not exist.
- Manual deployed UI smoke test and Cloud Scheduler execution: not run; no staging deployment or scheduler was authorized/configured.

## Staging release procedure

Do not deploy this branch as an enabled billing release until every gate below is satisfied.

1. Back up the staging database using a protected shell; never echo connection strings:

   ```sh
   pg_dump --format=custom --file=sensible-staging-before-phase11.dump "$DATABASE_ADMIN_URL"
   ```

2. Install and verify the exact revision:

   ```sh
   npm ci
   npm --prefix backend ci --legacy-peer-deps
   npm --prefix backend run typecheck
   npm --prefix backend run build
   npm --prefix backend run db:check
   ```

3. Set staging secrets/config through Secret Manager or Cloud Run configuration:

   - `DATABASE_URL`: non-superuser, non-`BYPASSRLS`, inheriting member of `sensible_app_role`.
   - `DATABASE_ADMIN_URL`: migration/reconciliation identity only; never expose it to clients.
   - `BILLING_PLATFORM_ADMIN_TENANT_ID`: approved platform tenant UUID.
   - Keep `PHONEPE_PG_LEGACY_V1_ENABLED=false`.
   - Keep `PHONEPE_PG_CREDITS_PER_INR` unset until written business approval.
   - Do not add production PG credentials. After v2 implementation, use sandbox OAuth credentials and HTTPS sandbox redirect/webhook URLs only.

4. Apply migrations under the admin identity, then audit:

   ```sh
   npm --prefix backend run db:check-state
   npm --prefix backend run db:migrate
   npm --prefix backend run db:check-state
   npm --prefix backend run audit:billing-db
   ```

   Expected after migration: 47 migrations; five billing tables owned by `sensible_rls_owner`; RLS and FORCE RLS true; owner schema USAGE true; platform-admin function present; app role has INSERT/UPDATE but not DELETE on rate cards; no outlets without wallets; all invariant counts zero.

5. With approved business values, create active rates for every enabled metered service (`whatsapp.service`, `email.ses`, `ai.agent_action`) through a platform-admin request. Verify an ordinary tenant admin receives 403 on create/update/deactivate and authenticated reads still work.

6. Keep the WhatsApp, AI, and SES billable provider paths unavailable in internal staging until their durable idempotency/recovery blockers are fixed. Top-up initiation must remain unavailable while the legacy gate is false.

7. Deploy the API, then check both liveness and database readiness:

   ```sh
   curl --fail "$SERVICE_URL/api/v1/health/live"
   curl --fail "$SERVICE_URL/api/v1/health/ready"
   ```

8. Smoke-test with isolated staging tenants: create an outlet and confirm one zero-balance wallet; verify cross-tenant reads fail; verify dashboard/history; fund only with an authorized internal test credit; exercise idempotent debit, insufficient balance, and rate-card deactivation/history. Do not perform real payments.

9. After implementing PhonePe OAuth/v2, execute the complete sandbox matrix: initiate; pending/success/failure/expiry; valid/invalid webhooks; duplicate/out-of-order/replay; redirect without payment; server-status verification; amount/order mismatch; database failure/retry; repeated reconciliation; and crash recovery. Only then consider setting the approved conversion rate.

## Reconciliation deployment requirement

Once the v2 provider adapter is complete, deploy `npm run reconcile:topups` as a private Cloud Run Job using the same application and admin database secrets and sandbox PG secrets. A template is:

```sh
gcloud run jobs deploy sensible-crm-topup-reconciliation \
  --source ./backend \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --command npm \
  --args run,reconcile:topups \
  --max-retries 0 \
  --task-timeout 10m

gcloud run jobs add-iam-policy-binding sensible-crm-topup-reconciliation \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --member "serviceAccount:$SCHEDULER_SERVICE_ACCOUNT" \
  --role roles/run.invoker

gcloud scheduler jobs create http sensible-crm-topup-reconciliation-every-5m \
  --project "$GCP_PROJECT_ID" \
  --location "$GCP_REGION" \
  --schedule "*/5 * * * *" \
  --time-zone "Etc/UTC" \
  --uri "https://$GCP_REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$GCP_PROJECT_ID/jobs/sensible-crm-topup-reconciliation:run" \
  --http-method POST \
  --oauth-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" \
  --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
```

Configure job secrets explicitly; the existing service deployment workflow does not create this job. Alert on non-zero job exits and the structured reconciliation error count.

## Rollback guidance

- Prefer forward fixes.
- 0047 rollback is intentionally a no-op because wallets are financial/audit records.
- 0046 rollback removes mutation policies/grants and the helper function, leaving rate-card writes fail-closed.
- Do not roll back 0044 in any environment containing financial records: it drops the entire billing schema. Restore from the verified backup if a destructive schema rollback is ever required.

## External-production blockers

External production remains blocked until all of the following are complete: current PhonePe OAuth/v2 implementation and sandbox certification; written conversion/rate approval; applied/audited migrations; scheduled reconciliation and alerting; durable WhatsApp/AI/SES dispatch-billing recovery; clean deployment CI with disposable PostgreSQL/pgvector; clean required build/test gates; production secret separation; and a documented operational rollback/incident drill.
