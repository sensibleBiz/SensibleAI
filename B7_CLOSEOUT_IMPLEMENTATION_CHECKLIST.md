# B7 Closeout Implementation Checklist

This checklist defines B7 completion as the following invariant for every migrated domain:

```text
PostgreSQL login -> postgresSession -> API with x-postgres-session: 1
  -> requirePostgresAuth -> PostgreSQL repository -> PostgreSQL
```

For a PostgreSQL-session user, falling through to a Firebase-authenticated route or reading/writing Firestore is a release blocker.

## Current repository baseline

- `backend/migrations/0008_phase_b7_attendance_leave.sql` already creates `crm.leave_types`, `crm.leave_requests`, `crm.leave_balances`, and `crm.holidays`, with tenant/outlet RLS.
- `backend/src/modules/leave/` already supports leave-type list/create, leave-request list, and approval/rejection for PostgreSQL sessions.
- Approval currently changes `crm.leave_balances`; request submission does not. Preserve that rule.
- `backend/src/modules/attendance/postgresAttendance.repository.ts` already reads approved leave and holidays from PostgreSQL for monthly attendance.
- Missing B7 surfaces: leave balance read/history/admin adjustment, holiday CRUD, and employee leave-request creation.
- `src/hooks/useLeaveBalance.ts`, `src/services/leaveBalanceService.ts`, `src/pages/attendance/LeaveBalancePage.tsx`, and `src/pages/attendance/HolidayCalender.tsx` still access Firestore.
- `src/services/api/customerApi.ts` does not select PostgreSQL auth and has no create/update methods.
- `src/services/api/productApi.ts` does not select PostgreSQL auth. It also models already-unwrapped `apiRequest` responses as `{ success, data }` and passes pre-stringified bodies to a client that stringifies again; both contracts must be corrected.
- Product and warehouse screens retain conditional Firestore branches. A PostgreSQL login must never enter those branches, including while session restoration is in progress.
- B7 tables are not represented in `backend/src/db/schema/crm.ts`.

## 1. Database and schema closeout

### `backend/migrations/0010_phase_b7_closeout.sql` — add

- [ ] Add `crm.leave_balance_entries` as the immutable balance-history ledger:
  - tenant, outlet, user, year, delta, entry type (`ALLOCATION`, `ADMIN_ADJUSTMENT`, `LEAVE_APPROVED`, `LEAVE_REVERSED`), optional leave-request ID, reason, actor, and timestamps.
  - Add tenant/outlet/user/year/date indexes and forced RLS through `crm.can_access_attendance`.
  - Add an idempotency constraint for request-derived entries, for example `(tenant_id, leave_request_id, entry_type)` where `leave_request_id IS NOT NULL`.
- [ ] Add `leave_type_id` to `crm.leave_requests`, referencing `crm.leave_types`; retain `leave_type` as the submitted display-name snapshot if compatibility requires it.
- [ ] Add holiday fields required by the existing UI contract: `holiday_type`, `description`, `applicable_states`, and `applicable_outlets`, or deliberately remove those controls from the UI/API contract. Do not silently discard them.
- [ ] Add a unique active holiday constraint/index for `(tenant_id, outlet_id, holiday_date)` unless multiple holidays on one date are an explicit business rule.
- [ ] Add check constraints: non-negative balance totals/usage, valid holiday year/date agreement, positive leave days, and `from_date <= to_date`.
- [ ] Add permissions: `leave.balance.read`, `leave.balance.manage`, `leave.request.create`, `holidays.read`, and `holidays.manage`; assign them to the intended PostgreSQL roles in the same migration/seed mechanism used by existing permissions.
- [ ] Add a `DELETE` RLS policy for `crm.holidays` only if hard delete is selected. Prefer soft delete through `is_active = false` so attendance history remains reproducible.
- [ ] Do not edit an already-applied migration in place. If `0008` is confirmed unapplied in every environment, these changes may be folded into it; otherwise keep `0010`.

### `backend/src/db/schema/crm.ts` — update

- [ ] Export Drizzle enums/tables for attendance events/daily rows, leave types/requests/balances/balance entries, and holidays.
- [ ] Mirror every SQL FK, unique key, check, and index used by B7 so generated schema and runtime SQL do not drift.

## 2. Leave balance API

Canonical routes:

```text
GET  /api/v1/leave/balances?outletId=&year=&userId=
GET  /api/v1/leave/balances/:userId/history?outletId=&year=&cursor=&limit=
PATCH /api/v1/leave/balances/:userId
```

### `backend/src/types/leave.types.ts` — update

- [ ] Add balance DTOs, list/detail query types, cursor/result types, history-entry types, and admin-adjustment input.
- [ ] Return `totalLeaves`, `usedLeaves`, and server-derived `remainingLeaves`; never accept `usedLeaves` or `remainingLeaves` from the client.
- [ ] Include employee display data needed by `LeaveBalancePage` (`userName`, `empCode`, designation, manager) from PostgreSQL joins rather than cached Firestore fields.

### `backend/src/validators/leave.validator.ts` and `backend/src/modules/leave/postgresLeave.validator.ts` — update

- [ ] Validate year, pagination, user ID, outlet ID, adjustment amount/new allocation, and mandatory adjustment reason.
- [ ] PostgreSQL validators must require UUIDs for all entity IDs.

### `backend/src/modules/leave/postgresLeave.repository.ts` — update

- [ ] Add paginated balance list/get and history queries scoped by tenant and outlet.
- [ ] Join active team membership and `iam.users`; exclude inactive employees by default, with an explicit query option if historical employees must be visible.
- [ ] Add a transaction-safe admin adjustment that locks/upserts the aggregate balance and inserts a ledger entry atomically.
- [ ] Refactor approval/rejection balance mutation to also insert idempotent ledger entries in the same transaction.
- [ ] Derive `remaining_leaves = total_leaves - used_leaves` server-side and prohibit a client-provided value.

### `backend/src/modules/leave/postgresLeave.service.ts` — update

- [ ] Enforce `leave.balance.read` for list/detail/history and `leave.balance.manage` for adjustment.
- [ ] Allow ordinary employees to read only their own balance; managers/admins may read their authorized outlet/team scope.
- [ ] Reject an adjustment that would create an invalid balance according to the agreed negative-balance policy.

### `backend/src/modules/leave/postgresLeave.controller.ts` — update

- [ ] Add balance list, history, and adjustment handlers using the established PostgreSQL request database context.

### `backend/src/modules/leave/postgresLeave.routes.ts` and `backend/src/routes/index.ts` — update

- [ ] Mount the canonical PostgreSQL router at `/leave` before any compatibility router.
- [ ] Register the three balance routes above behind `requirePostgresAuth` and `withRequestDatabaseContext`.
- [ ] Keep `/attendance/leaves` only as a temporary compatibility mount; do not let a request marked with `x-postgres-session: 1` fall through to the legacy router.

## 3. Holiday calendar API

Canonical routes:

```text
GET    /api/v1/leave/holidays?outletId=&year=
POST   /api/v1/leave/holidays
PATCH  /api/v1/leave/holidays/:holidayId
DELETE /api/v1/leave/holidays/:holidayId?outletId=
```

### `backend/src/types/leave.types.ts` — update

- [ ] Add one canonical holiday DTO and create/update/list types. Prefer ISO `YYYY-MM-DD` at the API boundary; map to display timestamps only in the UI.

### `backend/src/validators/leave.validator.ts` and `backend/src/modules/leave/postgresLeave.validator.ts` — update

- [ ] Validate outlet/year/date/title/type/paid/description/applicability fields and holiday UUID params.
- [ ] Reject a payload whose explicit year disagrees with its date; preferably derive year on the server.

### `backend/src/modules/leave/postgresLeave.repository.ts` — update

- [ ] Add ordered yearly list, create, update, and soft-delete methods for `crm.holidays`.
- [ ] Resolve/validate the outlet business ID on create and enforce tenant/outlet predicates on every update/delete.

### `backend/src/modules/leave/postgresLeave.service.ts` — update

- [ ] Enforce `holidays.read` and `holidays.manage`.
- [ ] Return `409 HOLIDAY_DATE_EXISTS` for the chosen uniqueness conflict and `404 HOLIDAY_NOT_FOUND` for cross-scope IDs.

### `backend/src/modules/leave/postgresLeave.controller.ts` and `postgresLeave.routes.ts` — update

- [ ] Add handlers/routes for the four holiday operations.
- [ ] Ensure monthly attendance continues to consume the same PostgreSQL holiday rows after CRUD changes.

## 4. Employee leave-request creation

Canonical route:

```text
POST /api/v1/leave/requests
```

### `backend/src/types/leave.types.ts` — update

- [ ] Add `LeaveRequestCreateInput` using `outletId`, `leaveTypeId`, `fromDate`, `toDate`, `duration`, and `leaveNote`. Do not trust client-supplied status, actor, manager, day/month IDs, timestamps, or `noDays`.

### `backend/src/validators/leave.validator.ts` and `backend/src/modules/leave/postgresLeave.validator.ts` — update

- [ ] Validate UUIDs, supported duration, normalized dates, note length, and sane range limits.
- [ ] Reject cross-year requests until balance splitting across years is explicitly implemented.

### `backend/src/modules/leave/postgresLeave.repository.ts` — update

- [ ] Resolve the authenticated employee’s active outlet membership and manager from PostgreSQL.
- [ ] Resolve an active leave type belonging to the same tenant/outlet.
- [ ] Lock/read the employee-year balance and query overlapping non-rejected requests.
- [ ] Insert a `REQUESTED` row with server-derived IDs, names, `no_days`, date keys, and timestamps.
- [ ] Do not update `crm.leave_balances` or create a balance ledger entry on submission.

### `backend/src/modules/leave/postgresLeave.service.ts` — update

- [ ] Enforce `leave.request.create`; default the employee to the authenticated user. Creating for another employee requires a separate explicit permission and payload field.
- [ ] Validate employee/outlet membership, leave-type scope, `from <= to`, overlap, and available annual balance.
- [ ] Compute requested days on the server using one documented policy for full/half days, weekends, and holidays. Add focused tests for the chosen rule.
- [ ] Treat pending requests as committed demand when checking availability, without deducting the stored balance. Recheck balance under lock during approval to handle concurrency.
- [ ] On approval, lock request and balance, require the current status to be `REQUESTED`, apply one deduction, and write one ledger entry atomically.
- [ ] On rejection of an approved request, reverse exactly once and write one reversal entry. Define whether direct `REJECTED -> APPROVED` is allowed; reject unsupported transitions.

### `backend/src/modules/leave/postgresLeave.controller.ts`, `postgresLeave.routes.ts`, and `backend/src/routes/index.ts` — update

- [ ] Add the create handler and exact `/api/v1/leave/requests` route.
- [ ] Add `GET /api/v1/leave/requests` as the canonical alias for the existing list endpoint so employee/admin clients share one route family.

## 5. Frontend leave and holiday migration

### `src/services/api/leaveApi.ts` — update

- [ ] Add `listBalances`, `getBalanceHistory`, `adjustBalance`, holiday CRUD, and `createRequest` methods.
- [ ] Use `/api/v1/leave/...` canonical paths.
- [ ] For a PostgreSQL-owned domain, select `authMode: "postgres"` from session state and fail closed if PostgreSQL session restoration fails; never retry with Firebase auth.

### `src/hooks/useLeaveBalance.ts` — replace Firestore implementation

- [ ] Remove `firebaseService`, `COLLECTION_NAME`, subscriptions, and direct document updates.
- [ ] Fetch balances through `leaveApi`; support abort/stale-request protection and an explicit `refetch` after mutations.
- [ ] Keep team-based presentation enrichment only if the API does not return it; do not use frontend filtering as the authorization boundary.
- [ ] Replace `syncLeaveBalances` with a server-owned reconciliation endpoint only if reconciliation is truly required. Normal operation must be transaction-driven, not client-driven sync.

### `src/services/leaveBalanceService.ts` — delete or rewrite

- [ ] Remove all Firestore balance/application reads and writes.
- [ ] Prefer deleting this service after call sites move to `leaveApi`. Balance math belongs in the PostgreSQL transaction, not the browser.

### `src/pages/attendance/LeaveBalancePage.tsx` — update

- [ ] Remove `firebaseService`/`COLLECTION_NAME` imports and Firestore bulk-create/update logic.
- [ ] Use API-backed hook mutations for single and bulk adjustments; require a reason and show per-row failures for bulk operations.
- [ ] Add an optional history/details drawer backed by the history endpoint.
- [ ] Refetch after mutation; loading/error/empty states must not display stale Firestore data.

### `src/pages/attendance/HolidayCalender.tsx` — update

- [ ] Remove all Firestore imports/subscriptions and call `leaveApi` for list/create/update/delete.
- [ ] Normalize dates to `YYYY-MM-DD` at the API boundary and preserve type, paid flag, description, and applicability fields supported by the schema.
- [ ] Refetch or update local cache only after a successful API response.

### Employee request UI — locate or add

- [ ] No employee request-creation component exists in the current web tree. Add one under `src/pages/attendance/` (or wire the external employee client) to call `leaveApi.createRequest`.
- [ ] Display current balance and pending demand, but rely on server validation for the final decision.

### `src/models/types.ts` — update

- [ ] Align `LeaveBalance`, `HolidayDTO`, and `LeaveApplication` with the canonical API DTOs; eliminate optional legacy aliases once all call sites are migrated.

## 6. Customer PostgreSQL-session consistency

### `src/services/api/customerApi.ts` — update

- [ ] Add the same PostgreSQL auth selection used by the migrated lead/attendance APIs to search, match, profile, and enquiries.
- [ ] Add create and update methods matching `POST /api/v1/customers` and `PATCH /api/v1/customers/:customerId`.
- [ ] Do not silently fall back to Firebase when a PostgreSQL session exists or restoration fails.

### Customer call sites — verify/update

- [ ] `src/pages/lead-management/CustomerSearchSelect.tsx`: PostgreSQL search/match only for a PostgreSQL login.
- [ ] `src/pages/lead-management/CustomerProfilePage.tsx`: PostgreSQL profile/enquiries only.
- [ ] `src/pages/lead-management/AddLeadForm.tsx`: PostgreSQL customer lookup/create/update path remains within the PostgreSQL session.

### Backend customer tests

- [ ] Extend `backend/tests/phase-b1-customer.test.ts` or add `backend/tests/phase-b7-closeout.test.ts` for PostgreSQL-session search, profile, create, update, outlet isolation, permission denial, invalid UUID, and no legacy-router fallthrough.

## 7. Product and warehouse authentication consistency

### `src/services/api/productApi.ts` — fix before UI verification

- [ ] Apply `authMode: "postgres"` to every product/category/warehouse/inventory/transfer request for a PostgreSQL session.
- [ ] Type `apiRequest<T>` with the unwrapped payload `T`; remove the extra `{ success, data }` response envelope and return the result directly.
- [ ] Pass object bodies to `apiRequest`; remove every `JSON.stringify(input)` because `apiRequest` already serializes the body.
- [ ] Fail closed on PostgreSQL auth failure; never retry with Firebase.

### Product/warehouse screens — remove mixed paths

- [ ] `src/pages/product/ProductsPage.tsx`: remove Firestore subscription/create/update/archive branches after PostgreSQL cutover.
- [ ] `src/pages/warehouse/addProduct.tsx`: remove Firestore category/product reads and writes.
- [ ] `src/pages/warehouse/CreateWarehouseProductPage.tsx`: remove Firestore create fallback.
- [ ] `src/pages/warehouse/WarehouseProductForm.tsx`: remove Firestore category fallback.
- [ ] `src/pages/warehouse/TransferRequest.tsx`: remove Firestore product and transfer-request branches.
- [ ] `src/pages/warehouse/dashboard.tsx` and `src/pages/warehouse/WareHouseDashboardNew.tsx`: replace product Firestore subscriptions with API data.
- [ ] `src/pages/warehouse/hooks/useWarehouseDashboardData.ts`: inventory/product data must be PostgreSQL-backed; document any unrelated shift-domain Firestore dependency separately rather than disguising it as warehouse completion.
- [ ] Base routing on the authenticated session provider, not a one-time `Boolean(postgresSession.getAccessToken())`, so initial render cannot choose Firebase while session restoration is pending.

### Backend product/warehouse tests

- [ ] Cover every PostgreSQL route with the session header, missing/expired auth, tenant/outlet isolation, and permissions.
- [ ] Add a routing test proving a request with `x-postgres-session: 1` cannot reach a legacy Firebase handler even when PostgreSQL auth fails.

## 8. Regression and no-Firebase verification

### `backend/tests/phase-b7-attendance-leave.test.ts` — extend

- [ ] Test balance list/own-scope/admin-scope/history/adjustment and aggregate-ledger atomicity.
- [ ] Test holiday CRUD, duplicate date, inactive holiday exclusion, and monthly attendance visibility.
- [ ] Test request creation validations: inactive/wrong-outlet employee, inactive/wrong-outlet type, invalid/reversed/cross-year dates, overlap, insufficient balance, and success.
- [ ] Assert submission leaves the aggregate balance unchanged.
- [ ] Test approval deduction, repeated approval idempotency, rejection reversal, repeated rejection idempotency, and concurrent approval safety.

### `backend/tests/integration/postgres.integration.test.ts` — extend

- [ ] Run the real PostgreSQL sequence: login -> customer search/profile/create/update -> product CRUD -> warehouse/inventory/transfer -> lead -> activity -> call -> attendance -> leave request -> approval -> balance/history -> holiday CRUD.
- [ ] Assert every request carries the PostgreSQL session marker and every returned entity belongs to the expected tenant/outlet.

### `tests/b7-pg-only-path.test.mjs` — add

- [ ] Static guard: migrated API adapters use PostgreSQL auth and B7 pages/hooks do not import `firebaseService`, Firebase SDKs, or Firestore constants.
- [ ] Static guard: `productApi` contains no pre-stringified request body or double response envelope.
- [ ] Static guard: canonical `/api/v1/leave/...` routes are mounted before compatibility routes.

### Runtime Firebase audit

- [ ] Run the complete regression journey with Firestore network calls blocked or Firebase credentials unavailable.
- [ ] Capture browser network logs and backend Firestore-profiler output; expected Firebase reads/writes for the scoped journey are exactly zero.
- [ ] Make any Firebase request during this journey a test failure, not a warning.

### Required commands

```powershell
npm run typecheck
npm run build
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run test:integration
node --test tests/b7-pg-only-path.test.mjs
```

## B7 definition of done

- [ ] All canonical leave balance, holiday, and leave-request endpoints exist and use PostgreSQL auth/context/RLS.
- [ ] A submitted request does not deduct balance; approval/reversal is atomic, audited, and idempotent.
- [ ] Leave balance and holiday UI paths contain no Firestore access.
- [ ] PostgreSQL customer, product, and warehouse calls explicitly use PostgreSQL auth and cannot fall through to Firebase.
- [ ] Product API request/response contracts are corrected.
- [ ] The end-to-end PostgreSQL-login regression passes with zero Firebase reads/writes.
- [ ] Only after every item above passes may B7 be marked complete and Events cleanup begin before Payroll.
