# Permission System Audit Report

Date: 10 September 2026  
Scope: current working tree (frontend permission assignment, sidebar visibility, route guards, outlet feature access, and backend authorization). No application code was changed.

## Executive summary

The reported symptom is reproducible from the code design: assigning a user permission does **not** by itself make a module visible. The sidebar also requires that the corresponding outlet feature/subscription is enabled. This second gate is not shown beside the assigned permission, so an administrator can successfully save a permission while the user still cannot see the module.

The audit also found inconsistent authorization between the sidebar and routes, one definite nested-permission UI bug, exact-string compatibility risks, and missing backend permission enforcement on several endpoints. These issues make permission behavior appear unreliable and, in some cases, allow direct-URL access to pages hidden by the sidebar.

## Findings

### P1 — High: permission assignment and module subscription are independent, silent gates

Evidence:

- `src/context/usePermission.ts:18-25` checks the active outlet's `outletPermissions`.
- `src/layouts/MainLayout.tsx:1011-1025` separately checks `hasOutletFeature(...)` before it checks the user's permission.
- `src/context/useOutletFeatureAccess.ts:42-47` uses the outlet's configured `enabledFeatureKeys` when a feature configuration exists.
- `src/pages/asssign-permission/editPermession.tsx:249-260` hides permissions belonging to outlet features that are disabled.

Impact: a permission can be present in `USER_PROFILE.permissions[].outletPermissions`, but the sidebar item remains hidden when the outlet feature key is absent from `MODULE_SUBSCRIPTION/FEATURE_ACCESS_CONFIG`. The UI gives no explanation such as “permission granted, module disabled for this outlet.” This is the strongest explanation for the reported symptom.

Recommended fix: use one access-decision function returning a reason (`allowed`, `missing_permission`, `feature_disabled`, `loading`, `wrong_outlet`) and show disabled modules/reasons to administrators. On save, warn when grants belong to disabled features.

### P1 — High: sidebar and route guards enforce different rules

The sidebar requires view permissions for many modules, while their React routes check only the feature flag. Examples:

- Reports: sidebar permissions at `src/layouts/MainLayout.tsx:66-71`; routes at `src/App.tsx:241-280` have no permission prop.
- Attendance/leave/salary: sidebar permissions at `src/layouts/MainLayout.tsx:73-83`; routes at `src/App.tsx:289-340` have no permission prop.
- User Tracking and Team Tree: sidebar permissions at `src/layouts/MainLayout.tsx:86,116`; routes at `src/App.tsx:362-382` have no permission prop.
- Integrations and Products: sidebar permissions at `src/layouts/MainLayout.tsx:117-118`; routes at `src/App.tsx:452-483` have no permission prop.
- WhatsApp and Sendesk Admin: sidebar permissions at `src/layouts/MainLayout.tsx:109,115`; routes at `src/App.tsx:512-514` and `589-591` have no permission prop.

Impact: a user can have a module hidden in the sidebar but open its page by typing/bookmarking the URL. Depending on each page's APIs, it may partially render, show errors, or expose data. This also makes debugging misleading because “menu access” and “URL access” disagree.

Recommended fix: derive both menu visibility and route guards from the same module access configuration. Add route tests covering allowed and denied users for every module.

### P1 — High: several backend routes validate outlet membership but not the module permission

The backend generally has good permission middleware, but some routes use only `requireOutletAccess`. Examples visible in the route audit include parts of lead, expense, event, tracking, and other APIs. `requireOutletAccess` only establishes outlet membership (`backend/src/middleware/auth.ts:161-187`); permission enforcement happens only when `requireOutletPermission(...)` is also installed (`backend/src/middleware/auth.ts:197-209`).

Impact: frontend hiding is not a security boundary. Any endpoint without `requireOutletPermission` may remain callable by an authenticated member of the outlet even when the relevant module permission is absent.

Recommended fix: create a permission matrix for every API route and make permission middleware mandatory by default, with explicitly documented exceptions. Add negative API tests for users who belong to an outlet but lack the permission.

### P2 — Medium: Delete permission is incorrectly dependent on Edit permission

Evidence: in `src/pages/asssign-permission/PermissionsMasterPage.tsx:90-103`, the Delete `<Can>` is nested inside the Edit `<Can>`.

Impact: a user with `CRM_PERMISSION_MASTER_DELETE` but without `CRM_PERMISSION_MASTER_EDIT` cannot see the delete action even though the delete permission is assigned. This is a concrete instance of “permission is there but action is unavailable.”

Recommended fix: render Edit and Delete as sibling permission checks.

### P2 — Medium: permission keys are exact, case-sensitive strings and one production key is misspelled

Evidence:

- Frontend uses `perms.includes(perm)` at `src/context/usePermission.ts:20-35`.
- Backend uses `.includes(permission)` at `backend/src/utils/accessControl.ts:72-90`.
- Source-wise reporting is defined and enforced as `CRM_SORCE_WISE_REPORT_VIEW` (missing “U”) in `src/utlis/constant.ts:291`, `src/layouts/MainLayout.tsx:67`, and `backend/src/routes/lead.routes.ts:81`.
- The grouping code recognizes both `CRM_SORCE...` and `CRM_SOURCE...` prefixes (`src/utlis/sidebarMenuConfig.ts:369-374`), but authorization recognizes only the misspelled key.

Impact: legacy/manual database values with different case, whitespace, or the correctly spelled `CRM_SOURCE_WISE_REPORT_VIEW` appear assigned but never match the runtime check.

Recommended fix: define canonical keys once in a shared package, migrate aliases to the canonical value, normalize reads during migration, and reject unknown keys during assignment.

### P2 — Medium: two separate sidebar configurations can drift

Evidence: `src/utlis/sidebarMenuConfig.ts:158-163` describes itself as the shared source of truth, but `src/layouts/MainLayout.tsx:55-142` and `586-936` manually duplicate permission, role, feature, and menu metadata.

Impact: adding or changing a module in one file can make the permission editor show one rule while the actual sidebar enforces another. This is a likely source of future “assigned but invisible” defects.

Recommended fix: render `MainLayout` directly from `SIDEBAR_MENU_OPTIONS` and remove `MENU_PERMISSIONS`, `MENU_ROLE_FALLBACK`, `MENU_FEATURE_BYPASS_ROLES`, and the duplicated `items` metadata.

### P2 — Medium: Permissions Master can be shown where its API always rejects access

Evidence:

- The client exposes Permissions Master based on permission/role/feature (`src/layouts/MainLayout.tsx:894-901`, `src/App.tsx:405-415`).
- The backend additionally requires the current outlet to be an internal admin outlet (`backend/src/services/accessControl.service.ts:45-53,170-173`).
- The sidebar's special internal-outlet restriction applies only to `OUTLET_FEATURE_ACCESS` (`src/layouts/MainLayout.tsx:1002-1007`), not Permissions Master.

Impact: a Super Admin in a non-internal outlet can see/open Permissions Master and receive a 403 error while loading its data.

Recommended fix: add the same internal-outlet condition to sidebar and route access, or remove the backend-only restriction if global permission masters are intended to be managed from any outlet.

### P3 — Low: permission refresh failures are silent and leave stale access in the UI

Evidence: access refresh runs only immediately, on focus, and every 30 seconds (`src/services/listenUserPermissions.ts:6-39`). Non-profile errors are only logged (`:21-27`).

Impact: after permissions are changed, an already logged-in user can see stale access for up to 30 seconds; if refresh fails, stale access persists with no user-facing status. This can look like the save did not work.

Recommended fix: push/invalidate permission changes, refresh immediately after save for the affected session where possible, and expose a visible “access could not be refreshed” state.

## What is working

- Explicit empty grants are intentionally distinguished from omitted grants.
- Super Admin and legacy Sub-Super Admin fallback behavior is consistent between frontend and backend.
- Outlet-scoped roles and permissions are consolidated rather than overwriting unrelated outlets.
- Frontend typecheck passed.
- Backend typecheck passed.
- Backend automated suite passed: 175 tests, 0 failures.

Passing tests do not cover the cross-layer menu/route/feature contradictions above.

## Recommended repair order

1. Fix the nested Delete/Edit `<Can>` bug.
2. Add missing permissions to every React route and corresponding backend route.
3. Centralize module access metadata and use it for the sidebar, route guards, and permission editor.
4. Make feature-disabled reasons visible when a permission is assigned.
5. Canonicalize/migrate permission keys, especially `SORCE` versus `SOURCE`.
6. Add a table-driven test matrix for `outlet + role + feature + permission -> menu, route, API`.

## Data checks for the affected user

For the exact user/outlet that reports the issue, verify:

1. The selected outlet ID exactly equals `permissions[].outletId`.
2. The expected key exactly exists in `outletPermissions` (case and spelling included).
3. The matching feature key exists in the outlet's feature configuration.
4. The browser's `/api/v1/access-control/me` response contains the updated grant.
5. The target API returns 200 rather than `PERMISSION_DENIED`, `INTERNAL_ADMIN_REQUIRED`, or `OUTLET_ACCESS_DENIED`.
