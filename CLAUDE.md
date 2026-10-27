# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- Never commit secrets (`.env`, service accounts, Meta/PhonePe/Gemini keys).
- Before opening a PR, these must pass:
  - root: `npm run typecheck && npm run lint && npm test`
  - backend (if touched): `cd backend && npm run typecheck && npm test`

  If anything fails, report it and stop. Do not loop on fixes.
- New code goes on Postgres/Drizzle only. Never add Firestore usage.
- For any new table or migration, use the `/new-migration` skill.

## Repository layout

Sensible CRM is a multi-tenant CRM made of three apps sharing one API:

- `/` — React 19 + Vite + TypeScript web app (Ant Design, Tailwind v4, Redux Toolkit). Source in `src/`.
- `backend/` — Express 5 + TypeScript API on PostgreSQL via Drizzle ORM, deployed to Cloud Run. Has its own `package.json`. Node `24.13.0`.
- `mobile/` — Flutter app (`mobile/lib/core/api/` talks to the same REST API).
- `gcp/` — standalone Cloud Functions (Meta leads, PhonePe and WhatsApp webhooks) and a Cloud Workflows saga.
- `dataconnect/` — Firebase Data Connect schema; the backend uses its generated admin SDK in `backend/src/dataconnect-admin-generated/` (local `file:` dependency).

PostgreSQL is the only store for CRM business data. Firebase is used only for Auth/OTP verification, and the legacy Firebase client lives in `src/shared/api/legacy-firebase/`. Many files and tests mention Firestore because they predate the Postgres cutover (`backend/tests/legacy-pre-postgres/`, `docs/firestore-cost-audit/`).

## Commands

Web app (repo root):

```bash
npm run dev            # runs Vite on :5173 and the backend API on :3001 together (concurrently)
npm run dev:web        # Vite only; /api is proxied to VITE_API_BASE_URL or http://127.0.0.1:3001
npm run build          # tsc -b && vite build
npm run typecheck
npm run lint           # eslint .
npm test               # node --test tests/*.test.mjs
node --test tests/billing.test.mjs   # single frontend test
```

Backend (`cd backend`):

```bash
npm run dev                 # tsx watch src/server.ts
npm run typecheck           # checks src and scripts (tsconfig.scripts.json)
npm run build               # clean dist + tsc
npm test                    # unit tests: tests/*.test.ts tests/unit/*.test.ts (what CI runs)
npm run test:integration    # tests/integration/*.test.ts, needs DATABASE_ADMIN_URL
npx tsx --test tests/customer.test.ts                     # single test file
npx tsx --test --test-name-pattern="normalization" tests/customer.test.ts   # single test case
npm run db:migrate          # apply migrations (uses DATABASE_ADMIN_URL, falls back to DATABASE_URL)
npm run db:rollback
npm run db:seed && npm run db:seed:auth-dev   # foundation data + a local login user (POSTGRES_DEV_USER_* env)
```

Tests use the built-in `node:test` runner through `tsx`, not Jest or Vitest. Integration tests create a temporary database, run all migrations, and seed it. `backend/scripts/ci-test-database-setup.sh` provisions the required roles.

Local Postgres: `docker compose up -d postgres` (custom image in `docker/postgres/`, which includes pgvector). Copy `backend/.env.example` to `backend/.env`.

Mobile: standard Flutter commands (`flutter pub get`, `flutter run`, `flutter test`) from `mobile/`.

## Backend architecture

**Request pipeline** (`backend/src/app.ts` → `routes/index.ts`): security headers and request ID, JSON logging, CORS, rate limits, then `apiRouter` mounted at `/api/v1`. Responses use the envelope `{ success: true, data }` or `{ success: false, message, code }`. Throw `AppError(status, message, code)` from `src/errors/appError.ts`.

**Feature modules** (`backend/src/modules/<feature>/`) follow a layered layout: `*.routes.ts` → `*.controller.ts` → `*.service.ts` → `*.repository.ts`, plus `*.validator.ts` (zod schemas used through `validateRequest({ body, query, params })`) and `*.types.ts`. Most files carry a `postgres` prefix left over from the migration.

**Session-header router selection:** many feature routers are root-mounted and only handle a request when the header `x-postgres-session: 1` is present; otherwise they call `next("router")`. The web client sets this header in `src/shared/api/apiClient.ts`. Auth routers must stay registered *before* these routers (see the comment in `routes/index.ts`).

**Auth and tenancy:**
- `requirePostgresAuth` verifies the API's own JWT (`jose`, `JWT_*` env), loads the user, and sets `request.postgresAuth = { userId, tenantId, isTenantAdmin }`.
- `withRequestDatabaseContext(handler)` wraps a handler in a transaction that sets the session variables `app.current_tenant_id`, `app.current_user_id`, `app.is_super_admin` and `app.is_platform_admin`. Handlers receive `request.database` (`{ client, db }`) and should pass it down to services and repositories instead of opening their own connections.
- **Tenant isolation is enforced by Postgres row-level security.** `DATABASE_URL` must be a non-superuser, non-BYPASSRLS login. The migrator grants it `sensible_app_role`. Repository code relies on RLS together with explicit `tenantId` filters.
- Permissions are checked per outlet in services through `postgresAuthorizationRepository.hasPermission` and `hasOutletPermission` (`modules/authorization/`), using permission strings such as `"lead_targets.create"`. On the frontend, `usePermission()` (`src/features/access-control`) and `PermissionRoute` gate the UI.

**Database:** the Drizzle schema lives in `backend/src/db/schema/*.ts`, and migrations are hand-written SQL in `backend/migrations/`. For any new table or migration, use the `/new-migration` skill.

**Feature flags via env:** AI features (`AI_RETRIEVAL_ENABLED`, `AI_AGENT_ACTIONS_ENABLED`, `AI_CUSTOMER_DOSSIERS_ENABLED`), PhonePe PG top-ups and search v2 are off by default and read from `src/config/env.ts`. Some features also need a per-outlet feature row. The AI assistant uses Google Gemini (`@google/genai`, `@google/adk`) with pgvector embeddings. Background work goes through Pub/Sub and Cloud Tasks (`src/gcp/`, `routes/pubsubPush.routes.ts`).

## Frontend architecture

- Path alias `@/*` → `src/*`. TypeScript `strict` is **off**, but `noUnusedLocals` and `noUnusedParameters` are on, so the build fails on unused code.
- `src/features/<feature>/` holds `api/` (calls through `apiRequest` from `@/shared/api`), `components/`, `types/` and `index.ts` (the public export surface). Routing lives in `src/app/router/AppRouter.tsx`; the store (redux-persist) lives in `src/app/store/`.
- In dev the API base URL is empty, so calls go through the Vite proxy. Production builds fall back to the Cloud Run URL hard-coded in `apiClient.ts` / `postgresSession.ts` unless `VITE_API_BASE_URL` is set.
- One build is deployed to three Firebase Hosting targets (`pro-aicrm`, `pro-exports`, `pro-accounts`) through the `deploy:*` scripts.

## CI/CD

- `.github/workflows/backend-cloud-run-deploy.yml`: a push to `main` that touches `backend/**` runs `npm ci --legacy-peer-deps`, `npm test` and `npm run build`, then deploys to Cloud Run (`sensible-crm-api`, `asia-south1`) and health-checks `/api/v1/health`.
- Separate workflows deploy the web app to Firebase Hosting (live on `main`, preview on PRs).

## Reference docs

`docs/` contains design notes for AI retrieval, dossiers, agent actions, timeline and billing phases. `POSTGRES_MOBILE_API.md` describes the mobile API contract. `PERMISSION_SYSTEM_AUDIT_REPORT.md` covers the permission model.
