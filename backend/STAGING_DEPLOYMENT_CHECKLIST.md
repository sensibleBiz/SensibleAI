# Staging Deployment Checklist

**Phase 15 — Internal Staging Gate**

> Distinguish items that have been **verified in a real staging environment** (✅ Verified) from items that are **documented but not yet verified** (📋 Documented). No production payment settings are enabled here.

---

## 1. Prerequisites

- [ ] PostgreSQL 15+ with extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm`, `unaccent`, `pgvector` (optional for AI features)
- [ ] Node.js 24.x
- [ ] `sensible_app_role` and `sensible_rls_owner` PostgreSQL roles provisioned (see `scripts/ci-test-database-setup.sh`)
- [ ] Migrations 0001–0048 applied cleanly to a fresh schema  
  - Verify: `SELECT count(*) FROM drizzle.__drizzle_migrations;` → must return `48`
- [ ] Rollback SQL for each migration verified offline (e.g. `0048_reconcile_retry_tracking_rollback.sql`)

---

## 2. Required Environment Variables

**Never put secret values in this file.** Set them in your secrets manager / environment.

### Database
| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | App connection string (uses `sensible_app_role`) | — |
| `DATABASE_ADMIN_URL` | Admin/migration connection string | — |

### Authentication
| Variable | Description | Default |
|---|---|---|
| `JWT_ACCESS_SECRET` | HS256 signing secret for access tokens — min 32 chars | — |
| `JWT_REFRESH_SECRET` | HS256 signing secret for refresh tokens — min 32 chars | — |
| `JWT_ISSUER` | Token issuer claim | `sensible-crm-api` |
| `JWT_AUDIENCE` | Token audience claim | `sensible-crm` |
| `JWT_ACCESS_TTL_SECONDS` | Access token TTL | `900` |
| `JWT_REFRESH_TTL_SECONDS` | Refresh token TTL | `2592000` |

### Webhooks / Security
| Variable | Description | Default |
|---|---|---|
| `INBOUND_EMAIL_WEBHOOK_SECRET` | Pre-shared secret for Cloudflare Worker inbound-email webhook (**required** — no fallback) | — |
| `EVENT_GATEWAY_API_KEY` | Pre-shared key for event gateway routes (PhonePe callback kiosk) (**required** — fail-closed) | — |

### PhonePe PG (Wallet Top-ups — Sandbox Only)
| Variable | Description | Default |
|---|---|---|
| `PHONEPE_PG_ENABLED` | Enable top-up feature | `false` |
| `PHONEPE_PG_PRODUCTION_ENABLED` | **Must stay `false` for staging** | `false` |
| `PHONEPE_PG_CLIENT_ID_TEST` | PhonePe sandbox client ID | — |
| `PHONEPE_PG_CLIENT_SECRET_TEST` | PhonePe sandbox client secret | — |
| `PHONEPE_PG_CLIENT_VERSION_TEST` | PhonePe sandbox client version | — |
| `PHONEPE_PG_WEBHOOK_USERNAME_TEST` | Sandbox webhook basic-auth username | — |
| `PHONEPE_PG_WEBHOOK_PASSWORD_TEST` | Sandbox webhook basic-auth password | — |
| `PHONEPE_PG_REDIRECT_URL` | Return URL after payment (your staging domain) | — |
| `PHONEPE_PG_CALLBACK_URL` | Server-side callback URL (PhonePe must be able to reach this) | — |
| `PHONEPE_PG_CREDITS_PER_INR` | **Must be set explicitly — no default.** Approved conversion rate. Do not invent. | — |
| `PHONEPE_PG_MIN_AMOUNT_INR` | Minimum top-up amount | `100` |
| `PHONEPE_PG_MAX_AMOUNT_INR` | Maximum top-up amount | `50000` |

> ⚠️ `PHONEPE_PG_PRODUCTION_ENABLED=false` is enforced by code. Setting it to `true` requires explicit release sign-off and must never be done in staging.

### Reconciliation Scheduler
| Variable | Description | Default |
|---|---|---|
| `TOPUP_RECONCILIATION_BATCH_SIZE` | Orders processed per cron run | `50` |
| `TOPUP_RECONCILIATION_MAX_EXECUTION_MS` | Max wall-clock per run (must be < cron interval) | `270000` |

### WhatsApp (MSG91)
| Variable | Description | Default |
|---|---|---|
| `WHATSAPP_INTEGRATED_NUMBER` | Your registered WhatsApp sender number | — |
| `WHATSAPP_MSG91_AUTH_KEY` | MSG91 authentication key | — |
| `WHATSAPP_API_URL` | MSG91 API base URL | — |
| `WHATSAPP_MESSAGE_API_URL` | MSG91 message send endpoint | — |

### AI Assistant (Google AI / Vertex AI)
| Variable | Description | Default |
|---|---|---|
| `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Google AI Studio API key | — |
| `CRM_ASSISTANT_MODEL` | Gemini model name | `gemini-3.8-flash` |
| `AI_RETRIEVAL_ENABLED` | Enable semantic lead search | `false` |
| `AI_AGENT_ACTIONS_ENABLED` | Enable write actions (set targets) | `false` |

### Amazon SES (Transactional Email)
| Variable | Description | Default |
|---|---|---|
| `AWS_REGION` | SES region | `ap-southeast-2` |
| `AWS_ACCESS_KEY_ID` | IAM credentials | — |
| `AWS_SECRET_ACCESS_KEY` | IAM credentials | — |
| `SES_FROM_EMAIL` | Verified sender address | `communications@sensible.biz` |

### Billing Platform Admin
| Variable | Description | Default |
|---|---|---|
| `BILLING_PLATFORM_ADMIN_TENANT_ID` | UUID of the Sensible AI platform-admin tenant. Required for rate-card admin mutations. | — |

---

## 3. Platform-Admin Tenant Configuration

- [ ] Create the platform-admin tenant in the database (if not already seeded)
- [ ] Set `BILLING_PLATFORM_ADMIN_TENANT_ID` to its UUID
- [ ] Assign a user to that tenant with `isTenantAdmin = true`
- [ ] Verify rate-card admin endpoints respond correctly (see `tests/integration/rateCardAdmin.security.test.ts`)

---

## 4. PhonePe Sandbox Configuration

- [ ] Use sandbox credentials (`PHONEPE_PG_CLIENT_ID_TEST` / `PHONEPE_PG_CLIENT_SECRET_TEST`)
- [ ] `PHONEPE_PG_PRODUCTION_ENABLED` stays `false`
- [ ] Verify PhonePe sandbox callback URL is reachable from PhonePe's servers
- [ ] Test a full top-up initiation, redirect, and webhook callback with sandbox credentials
- [ ] Verify wallet credit appears after sandbox order completes
- [ ] Verify idempotency: duplicate callback does not double-credit

---

## 5. Top-up Feature Flags and Fail-Closed Behavior

- [ ] `PHONEPE_PG_ENABLED=false` → top-up endpoints return 503 (verify manually)
- [ ] `PHONEPE_PG_CREDITS_PER_INR` unset → top-up initiation returns error (do not default)
- [ ] Test that the reconciliation script exits with code 1 when dead-lettered orders exist

---

## 6. Reconciliation Scheduler Setup

Recommended cron (runs every 5 minutes; max execution 4.5 min leaves a 30 s gap):

```cron
*/5 * * * * node --loader ts-node/esm backend/scripts/reconcile-topups.ts >> /var/log/crm/reconcile.log 2>&1
```

- [ ] Cron registered and enabled
- [ ] Alert configured on non-zero exit code
- [ ] Structured log `TOPUP_RECONCILIATION_COMMAND_COMPLETE` visible in log aggregator
- [ ] DEAD_LETTER alert: `reconcile_last_failure_class = 'DEAD_LETTER'` triggers operator notification

**Manual recovery for DEAD_LETTER orders:**
```sql
-- Inspect dead-lettered orders
SELECT id, order_ref, reconcile_retry_count, reconcile_last_failure_class, created_at
FROM billing.top_up_orders
WHERE reconcile_last_failure_class = 'DEAD_LETTER';

-- Operator re-queue: requires ops-lead sign-off
UPDATE billing.top_up_orders
SET reconcile_retry_count = 0, reconcile_last_failure_class = NULL, reconcile_next_retry_at = NULL
WHERE id = '<order-id>';
```

---

## 7. WhatsApp, AI, and SES Recovery Workers

### SES Post-Send Billing Recovery

When `EMAIL_BILLING_FAILED_AFTER_SEND` appears in logs, use the recovery script:

```bash
RECOVER_TENANT_ID=<uuid from log>   \
RECOVER_OUTLET_ID=<uuid from log>   \
RECOVER_ACTOR_USER_ID=<admin uuid>  \
RECOVER_SES_MESSAGE_ID=<SES MessageId from log> \
  node --loader ts-node/esm backend/scripts/recover-ses-usage.ts
```

The script is idempotent (uses `ses:{messageId}` as the idempotency key).

### WhatsApp Dispatch Race (Known Gap)

**Residual risk:** If the outer database transaction containing `appendOutbound` + `meterUsage` rolls back after MSG91 has accepted the message, the message is delivered to the recipient but not recorded or billed. The message UUID is generated before dispatch but not persisted to a recovery table.

**Manual reconciliation path:** Check MSG91 delivery reports for the relevant time window against WhatsApp conversations in the database. If a message is present in MSG91 but not in the conversation's `sent_messages` array, contact the MSG91 webhook or re-insert manually.

**This risk is accepted for Phase 15 internal staging.** A schema change (dispatched-message pre-record table) is required to close this gap fully.

### AI Assistant Usage (Known Gap)

AI usage events are metered within the same database transaction as the assistant response. If the transaction fails after the Google ADK call, usage is not charged and not recorded. Token-level billing requires external metering which is a Phase 7+ item.

---

## 8. Health Checks, Logs, and Alerts

- [ ] `GET /api/health` returns 200 with `{ status: "ok" }`
- [ ] `GET /api/health/db` returns PostgreSQL connectivity status
- [ ] Structured JSON logs flowing to log aggregator (check `event` field)
- [ ] Alert on `severity: "ERROR"` log lines
- [ ] Alert on `reconcile_last_failure_class = 'DEAD_LETTER'` in billing table

**Smoke tests after deployment:**
```bash
# Auth round-trip
curl -X POST /api/v1/auth/login -H 'Content-Type: application/json' -d '{"identifier":"admin@example.com","password":"..."}'

# Top-up feature flag (should be 503 when disabled)
curl -X POST /api/v1/billing/topup/initiate -H "Authorization: Bearer $TOKEN"

# Event gateway authentication (should be 401)
curl -X POST /api/v1/event/create -H "Content-Type: application/json" -d '{}'

# Inbound webhook auth (should be 401 or 503)
curl -X POST /api/v1/webhooks/inbound-email -H "Content-Type: application/json" -d '{}'
```

---

## 9. Deployment Ordering

1. Apply migration `0048_reconcile_retry_tracking.sql` (backward-compatible, can run before or during deploy)
2. Set all required environment variables in secrets manager
3. Deploy new backend build
4. Verify health endpoints
5. Enable reconciliation cron
6. Run smoke tests above

---

## 10. Rollback Procedure

1. Stop reconciliation cron
2. Roll back backend binary to previous version
3. Apply `0048_reconcile_retry_tracking_rollback.sql`:
   ```bash
   psql $DATABASE_ADMIN_URL -f backend/migrations/0048_reconcile_retry_tracking_rollback.sql
   ```
4. Operational metadata in the 3 new columns is lost (acceptable — not payment data)

---

## 11. Outstanding Gates Before Production

- [ ] **WhatsApp recovery schema** — pre-dispatch record table to close dispatch/billing race
- [ ] **AI usage metering** — Phase 7+ token-level billing
- [ ] **`sensible_app_role` + `sensible_rls_owner` in CI** — PostgreSQL role fixture tests currently skip (see `scripts/ci-test-database-setup.sh`)
- [ ] **Load test** — reconciliation cron under 500+ simultaneous PENDING orders
- [ ] **Pen test** — independent review of AUTH-01 and AUTH-02 fixes
- [ ] **`PHONEPE_PG_PRODUCTION_ENABLED=true` sign-off** — explicit ops-lead approval required; never set in staging
- [ ] **DEAD_LETTER alerting** — wired to on-call pager
- [ ] **PhonePe production credentials** — reviewed and approved separately

---

*Last updated: 2026-10-10 (Phase 15)*  
*This checklist covers code-verified configuration. Items not marked ✅ Verified have not been exercised in a live staging environment.*
