# Phase 12 — PhonePe Standard Checkout v2

## Official API contract inspected before implementation

Sources inspected on 2026-10-10:

- [Authorization](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/authorization)
- [Create Payment](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/create-payment)
- [Order Status](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/order-status)
- [Webhook Handling](https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/webhook)
- [Official Node.js SDK reference implementation](https://github.com/PhonePe/phonepe-pg-sdk-node)

### OAuth authorization

- Sandbox: `POST https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token`
- Production: `POST https://api.phonepe.com/apis/identity-manager/v1/oauth/token`
- Content type: `application/x-www-form-urlencoded`
- Body: `client_id`, `client_version`, `client_secret`, and `grant_type=client_credentials`
- Required response fields: `access_token`, `expires_at` (epoch seconds), and `token_type` (`O-Bearer`).
- Checkout API authentication: `Authorization: O-Bearer <access_token>`.
- The token is cached server-side only and refreshed before `expires_at`. A provider `401` invalidates it and permits one credential refresh/retry. Tokens and credentials must never be returned or logged.

### Create payment v2

- Sandbox: `POST https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay`
- Production: `POST https://api.phonepe.com/apis/pg/checkout/v2/pay`
- JSON body used here:
  - `merchantOrderId`: unique merchant identifier, maximum 63 characters; only underscore and hyphen are permitted as special characters.
  - `amount`: integer paise, minimum 100.
  - `expireAfter`: optional 300–3600 seconds. This integration uses the existing 30-minute order lifetime (`1800`).
  - `paymentFlow.type`: `PG_CHECKOUT`.
  - `paymentFlow.merchantUrls.redirectUrl`: browser return URL. This is not proof of payment.
- Success response: `orderId`, `state` (`PENDING` expected), `expireAt` (epoch milliseconds), and `redirectUrl`.
- The webhook URL is configured in the PhonePe Business Dashboard, not supplied in the v2 create body.

### Order status v2

- Sandbox: `GET https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/{merchantOrderId}/status?details=false&errorContext=true`
- Production: `GET https://api.phonepe.com/apis/pg/checkout/v2/order/{merchantOrderId}/status?details=false&errorContext=true`
- The response contains the PhonePe `orderId`, root `state`, integer-paise `amount`, `expireAt`, and `paymentDetails` attempts. A completed attempt supplies its `transactionId`.
- Only the root order state controls the order outcome. Unknown/non-documented states remain non-terminal. A wallet credit requires `COMPLETED`, the exact expected amount, an exact local merchant-order lookup, and a completed transaction ID.

### Webhook authentication and handling

PhonePe currently documents HMAC and SHA authentication choices configured in its Business Dashboard. This integration uses the documented SHA option:

- Configure an environment-specific username and password in PhonePe and in backend secrets.
- PhonePe sends `Authorization = SHA256(username:password)`.
- Recompute that lowercase hexadecimal SHA-256 value and compare it in constant time.
- Subscribe only to `checkout.order.completed` and `checkout.order.failed`.
- The payment webhook body contains `event` and `payload`, including `orderId`, `merchantId`, `merchantOrderId`, root `state`, `amount`, `expireAt`, and `paymentDetails`.
- The webhook body is only an authenticated trigger. This application still fetches order status server-to-server before changing financial state.
- Duplicate, replayed, delayed, and out-of-order notifications are handled through the existing order lock, status transition guards, and wallet ledger idempotency key.

## Existing implementation inspection

- The online PG adapter was legacy `/pg/v1/pay` and `/pg/v1/status`, with Base64 payloads, salt keys, and `X-VERIFY`.
- Browser polling already calls a backend verification service and does not accept a client payment state.
- Callback and reconciliation paths already converge on `verifyAndCreditTopUp`.
- Wallet credit and SUCCESS are written in one database transaction after an order row lock; the wallet ledger uses `topup:<order-id>` as its idempotency key.
- Failed and ambiguous records are retained. Initiation timeouts leave a CREATED record for reconciliation.
- PhonePe Offline POS is isolated in `phonePeOffline.service.ts` with separate credentials and hosts.

## Implementation plan

1. Replace the online PG v1 adapter with OAuth, token caching/refresh, v2 create, and v2 status.
2. Adopt SHA-authenticated v2 payment webhooks and reject unsupported events.
3. Store PhonePe's `orderId` separately while retaining the local `orderRef` as `merchantOrderId`.
4. Preserve the existing authoritative verification, transactional credit, and reconciliation paths.
5. Add explicit general and production enable gates with separate sandbox/production credentials; keep v1 unavailable and conversion unset by default.
6. Update deterministic HTTP mocks and lifecycle tests; run sandbox checks only if valid sandbox credentials are explicitly available.

## Verification report

### Files changed

- `backend/src/modules/billing/phonePePg.service.ts` — OAuth token acquisition/cache/refresh, v2 create and status requests, status mapping, constant-time SHA webhook authentication, and payment-event parsing.
- `backend/src/modules/billing/phonePePg.routes.ts` — callback remains a trigger into the shared verification and credit service; browser status polling remains server-verified.
- `backend/src/modules/billing/topUp.service.ts` and `backend/src/modules/billing/topUp.types.ts` — preserve the local merchant order reference, persist and validate PhonePe's v2 `orderId`, and use existing atomic wallet-credit finalization.
- `backend/src/config/env.ts` and `backend/.env.example` — independent test/live credential sets, default-off enable flags, and an unset conversion rate.
- `backend/tests/unit/phonePePg.unit.test.ts` — mocked OAuth, v2 API, webhook, production-gate, and Offline POS regression tests.
- `backend/tests/integration/topUp.lifecycle.integration.test.ts` — disposable PostgreSQL tests for lifecycle, concurrency, callbacks, DB rollback/retry, ambiguous create timeout, and reconciliation.
- `docs/phase-12-phonepe-standard-checkout-v2.md` — contract and operational notes.

No database migration was needed: the existing `provider_order_id` column stores PhonePe's v2 `orderId`; the local `order_ref` remains the v2 `merchantOrderId`. No deployment secret values or production credentials were added. `.env.example` keeps PG initiation and production explicitly disabled and leaves `PHONEPE_PG_CREDITS_PER_INR` blank. It is an example configuration, not a production release configuration.

### Test and build results

| Check | Result |
|---|---|
| Focused PhonePe v2 unit tests | **PASS** — 12 passed, 0 failed, 0 skipped. |
| Disposable PostgreSQL top-up lifecycle test | **PASS** — 1 passed. Verified concurrent confirmations mint once; browser return is non-authoritative; delayed/out-of-order and duplicate callback behavior; credit rollback and successful retry; and stale-order reconciliation. The mocked create-timeout assertion confirmed one POST attempt and the order remains `CREATED`. |
| Backend TypeScript checks (`backend/npm run typecheck`) | **PASS** — application and script checks completed. |
| Backend build (`backend/npm run build`) | **PASS**. |
| Full backend unit suite | **FAIL / baseline** — 174 passed, 46 failed. The failures are module-resolution errors for unrelated missing legacy source modules (for example, access-control, activity, attendance, and WhatsApp automation); the focused PhonePe tests pass. |
| Full backend PostgreSQL integration suite | **PARTIAL** — 17 passed, 2 failed, 4 skipped. The top-up lifecycle test passed. The migration rollback worker reported missing `DATABASE_ADMIN_URL`; the PostgreSQL rebuild/security test failed while terminating a backend due to insufficient privileges. These are test-environment/baseline failures, not PhonePe assertions. |
| Repository-root frontend typecheck/build | **FAIL / unrelated baseline** — existing frontend TypeScript errors include missing `exportSampleData` and `salesOrdersData` modules, `EmployeeTargeting` typing, and `SalesOrdersPage` form-path errors. |
| PhonePe sandbox calls | **NOT RUN** — no valid sandbox account credentials were provided and validated. All provider calls in tests were mocked. No production payment endpoint was invoked. |

### Configuration and release prerequisites

- Configure separate sandbox and production OAuth client ID, client secret, and client version. Configure each environment's webhook username/password identically in the PhonePe Business Dashboard and backend secret store.
- Configure the webhook URL in the PhonePe Business Dashboard and allow only the documented completed/failed checkout events. `PHONEPE_PG_CALLBACK_URL` is validated as deployment configuration; it is not sent in the v2 create-payment request.
- Keep `PHONEPE_PG_ENABLED=false`, `PHONEPE_PG_PRODUCTION_ENABLED=false`, and the legacy-v1 flag false until the credentials, HTTPS redirect/callback destinations, sandbox behavior, approved credit conversion, reconciliation schedule, and release controls are reviewed and validated.
- Production remains disabled by default and fails closed unless production credentials and webhook authentication settings are supplied. No production readiness is claimed.
- The current integration uses PhonePe's documented SHA username/password webhook mode. If the PhonePe account is configured for HMAC instead, configure the dashboard for SHA or implement and test the documented HMAC mode before enabling callbacks.
