# PostgreSQL Mobile API Reference

Source of truth inspected: `backend/src/app.ts`, `backend/src/routes/index.ts`, all `backend/src/modules/**/postgres*.routes.ts`, their validators, controllers, and shared validators.

## 1. Base URL, headers, and response format

All paths below are relative to:

```text
https://<API_HOST>/api/v1
```

JSON headers for normal requests:

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
X-Postgres-Session: 1
```

`Authorization` is not required for login, refresh, logout, QR-session creation/polling, event gateway endpoints, or biometric-device ingest. `X-Postgres-Session: 1` should be sent by the mobile client on every PostgreSQL request. It is mandatory for refresh/logout and selects PostgreSQL rather than a legacy route for many feature APIs.

The normal success envelope is:

```json
{ "success": true, "data": {} }
```

List responses normally use:

```json
{
  "success": true,
  "data": {
    "items": [],
    "nextCursor": null
  }
}
```

The common error envelope is:

```json
{
  "success": false,
  "message": "Human-readable error",
  "code": "VALIDATION_ERROR"
}
```

Common statuses are `400` validation, `401` invalid/expired access token, `403` insufficient access or missing PostgreSQL selector, `404` not found, `409` conflict, and `500` unexpected error. Strict request schemas reject unknown fields.

Notation in this document:

- `uuid` = PostgreSQL UUID string.
- `ms` = Unix epoch milliseconds.
- `date` = `YYYY-MM-DD`; `month` = `YYYY-MM`.
- `?` = optional. A value after `=` is the server default.
- `Body: none` means do not send a JSON body.
- `R:` describes `data` inside the standard success envelope unless a different response is shown.

## 2. Authentication and session lifecycle

### Phone onboarding and profile creation

`POST /auth/onboarding/check-phone` is public and accepts a 10-digit Indian
mobile number:

```json
{ "phoneNumber": "9876543210" }
```

It returns `{ "exists": true, "loginMethod": "otp" }` for an existing
account, or `{ "exists": false }` for a new number.

After Firebase Phone OTP succeeds, send the Firebase ID token as the bearer
token to `GET /auth/onboarding/status`. If `exists` is false, create the owner,
business, tenant, main outlet, and tenant-admin membership with
`POST /auth/onboarding/business`:

```json
{
  "ownerName": "Asha Patil",
  "email": "owner@example.com",
  "businessName": "Asha Traders",
  "branch": "Main Branch",
  "address": "12 Market Road",
  "city": "Pune",
  "state": "Maharashtra"
}
```

The phone is taken only from the verified Firebase token. Do not send a phone,
password, quick PIN, role, outlet ID, or permissions in this request. A
successful `201` response sets the PostgreSQL refresh cookie and returns the
access token, user, tenant/outlet context, access snapshot, and created outlet.
The owner is assigned tenant-administrator access by the server.

### POST `/auth/login`

No bearer token. Body:

```json
{ "identifier": "email-or-phone", "password": "password" }
```

Response `200` (also sets the HttpOnly `sensible_crm_refresh` cookie scoped to `/api/v1`):

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "accessTokenExpiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "phone": "+919999999999",
      "displayName": "User"
    },
    "context": {
      "tenantId": "uuid",
      "isTenantAdmin": false,
      "outletIds": ["uuid"]
    }
  }
}
```

The refresh token is deliberately not returned in JSON. A native HTTP client must enable cookie storage and resend cookies. In production the cookie is `HttpOnly; Secure; SameSite=None`.

### POST `/auth/refresh`

Headers: `X-Postgres-Session: 1`; send the stored refresh cookie. Body: none. R: the same token/user/context object as login and a rotated refresh cookie.

### POST `/auth/logout`

Headers: `X-Postgres-Session: 1`; send the stored refresh cookie. Body: none. R: `{ "loggedOut": true }`; clears the cookie.

### GET `/me`

R: current user, tenant membership, outlet access, roles, and effective permissions.

Each item in `outlets` includes `id`, `name`, `businessId`, `businessName`,
`roleId`, `roleName`, `permissions`, `profileRole`, `departments`, and `zones`.
Mobile clients should group permitted outlets by `businessId` when presenting a
business/outlet context switcher, while continuing to send the selected
`outletId` to operational APIs.

### PATCH `/me`

Updates the authenticated user's editable identity fields. Send at least one:

```json
{ "displayName": "Asha Patil", "email": "asha@example.com" }
```

Email is normalized to lowercase. Phone, password, quick PIN, role, active
status, outlets, and permissions cannot be changed through this endpoint. The
response uses the same current-access shape as `GET /me`.

### GET `/access-control/me`

Same response contract as `/me`. Requires the selector header.

### QR sessions

| Method and path | Request | Response data |
|---|---|---|
| POST `/auth/qr-sessions` | none | `201`; created QR session `{id/sessionId, status, expiresAt, ...}` |
| GET `/auth/qr-sessions/:sessionId` | path `sessionId` | current QR session |
| POST `/auth/qr-sessions/:sessionId/claim` | Firebase bearer/profile auth, not PostgreSQL JWT | claimed QR session |

## 3. Customers

All endpoints require bearer auth and the selector header.

| Method and path | Query/body | Response data |
|---|---|---|
| POST `/customers` | body `CustomerCreate` | `201` if created, otherwise `200`; `{created, customer, ...}` |
| GET `/customers` | `outletId:uuid`, `query?`, `status?:ACTIVE\|INACTIVE`, `limit?=30` (max 100), `cursor?` | page of customers |
| GET `/customers/search` | `outletId`, `query` (min 2), `limit?=10` (max 20) | matching customer items |
| GET `/customers/match` | `outletId`, one of `mobile`, `email`, `businessName`; `city?`, `state?`, `limit?=10` | identity-match candidates |
| GET `/customers/:customerId/enquiries` | `outletId`, `limit?=20`, `cursor?` | page of customer enquiries/leads |
| GET `/customers/:customerId` | `outletId` | customer detail |
| PATCH `/customers/:customerId` | body `CustomerUpdate` | updated customer |

`CustomerCreate`:

```json
{
  "outletId": "uuid",
  "customerName": "Acme Contact",
  "businessName": "Acme",
  "mobile": "9876543210",
  "email": "buyer@example.com",
  "businessType": "Retail",
  "area": "Area",
  "city": "Pune",
  "state": "Maharashtra",
  "priority": "High",
  "source": "Reference"
}
```

Only `outletId` and `customerName` are structurally required, but at least one of mobile, email, or business name plus city/state must identify the customer. Optional strings default to `""`.

`CustomerUpdate`: `outletId` plus at least one optional field from the create body; it additionally accepts `status: ACTIVE|INACTIVE`.

## 4. Leads, dashboards, and sales targets

All require bearer auth and selector header. Lead IDs accept non-slash identifiers; target IDs are UUIDs.

Common lead list query: `outletId`, `startDate?`, `endDate?` (`date` or `ms`), `stage?`, `status?`, `assignedTo?`, `unassigned?=true`, `source?`, `sourceKey?`, `search?`, `limit?=30` (max 100), `cursor?`.

`sourceKey`: `indiamart|justdial|facebook|instagram|google|website|reference|self-generated|cold-call|linkedin|whatsapp|email|walk-in|other`.

| Method and path | Query/body | Response data |
|---|---|---|
| POST `/leads` | body `LeadCreate` | `201`; `{id, lead}` |
| GET `/leads` | common lead list query | `{items, nextCursor}` |
| GET `/leads/ringing` | `outletId`, required `startDate`, `endDate`, `limit?=50`, `cursor?` | ringing lead page |
| GET `/leads/repeated-enquiries` | `outletId`, required dates, `assignedTo?`, `source?`, `search?`, `limit?=50` | repeated-enquiry result |
| GET `/leads/:leadId` | no query | lead detail |
| PATCH `/leads/:leadId` | body `LeadUpdate` | updated lead |
| POST `/leads/:leadId/assign` | `{outletId, assignedTo, comments?="", leadTag?=[], stage?}` | assigned lead |
| POST `/leads/:leadId/stage` | `{outletId, stage?, comments?="", leadTag?=[]}` | updated lead |
| POST `/leads/:leadId/whatsapp-share` | none | share token/link result |
| POST `/leads/:leadId/ringing` | `{outletId, ringing:boolean}` | `{id, status, updatedDate}` |
| GET `/leads/share/:shareToken` | no query; still requires auth | shared lead |

`LeadCreate`:

```json
{
  "outletId": "uuid",
  "customerId": null,
  "customerName": "Jane",
  "mobile": "9876543210",
  "requirement": "Needs product demo",
  "assignedTo": "uuid",
  "adId": "",
  "area": "",
  "businessName": "",
  "businessType": "",
  "city": "",
  "email": "",
  "priority": "High",
  "source": "Website",
  "state": ""
}
```

Required: `outletId`, `customerName`, 10-digit `mobile`, `requirement`. Other fields shown are optional; most default to `""`. Stages: `NEW|ASSIGNED|FOLLOWUP|WON|LOST|DISQUALIFIED`.

`LeadUpdate`: `outletId` plus at least one of `area`, `businessName`, `businessType`, `city`, `email`, `mobile`, `priority`, `requirement`, `source`, `state`, `username`.

Reports use `outletId`, required `startDate`, `endDate` (maximum range 366 days):

| Method and path | Extra query | Response data |
|---|---|---|
| GET `/leads/reports/employees` | none | employee lead report |
| GET `/leads/reports/source` | none | source-wise report |
| GET `/leads/reports/city-state` | none | city/state report |
| GET `/leads/reports/funnel` | `assignedTo?`, `source?` | funnel report |
| GET `/leads/reports/stage-counts` | `assignedTo?`, `source?` | stage counts |
| GET `/leads/dashboard` | none | combined dashboard metrics |

Sales targets:

| Method and path | Request | Response data |
|---|---|---|
| GET `/leads/employee-targets` | `outletId`, `month:1..12`, `year:2000..2100` | `{items}` |
| POST `/leads/employee-targets/sync` | target sync body below | synced result |
| DELETE `/leads/employee-targets/:targetId` | query `outletId` | `{deleted:true}` |

```json
{
  "outletId": "uuid",
  "month": 9,
  "year": 2026,
  "items": [{
    "id": "optional-uuid",
    "zone": "South",
    "saleExecutive": "Name",
    "saleExecutiveId": "optional-uuid",
    "decForecastNetSales": 100000,
    "achieveNetSales": 75000,
    "order": 1
  }]
}
```

Zone is `South|West|East|North|Subscriptions`; max 500 items.

## 5. Activities

Requires bearer auth and selector header.

List query: required `outletId`; optional `leadId`, `customerId`, `assignedTo`, `mode:Online|Offline`, `priority:Low|Medium|High|Urgent`, `search`, `status:PENDING|DONE`, `type:Follow Up|Demo|Installation|Visit`, `startDate:ms`, `endDate:ms`, `limit?=30`, `cursor?`.

| Method and path | Request | Response data |
|---|---|---|
| GET `/activities` | list query | `{items, nextCursor, summary:{total,done,pending,overdue}}` |
| GET `/activities/:activityId` | query `outletId` | activity |
| PATCH `/activities/:activityId` | `{outletId, assignedTo?:uuid, scheduledDate?:ms, status?:PENDING\|DONE}` | updated activity |
| DELETE `/activities/:activityId` | query `outletId` | deletion result |
| GET `/leads/:leadId/activities` | list query without `leadId` | activity page |
| POST `/leads/:leadId/activities` | body below | `201`; created activity |

```json
{
  "outletId": "uuid",
  "assignedTo": "uuid",
  "description": "Follow up",
  "mode": "Online",
  "priority": "High",
  "productDealerPrice": 100,
  "productId": null,
  "productMrpPrice": 120,
  "productName": null,
  "productType": "Software",
  "scheduledDate": 1790631000000,
  "type": "Follow Up",
  "callLater": false
}
```

## 6. Calls

Requires bearer auth and selector header. Directions: `incoming|outgoing|missed|rejected`.

| Method and path | Request | Response data |
|---|---|---|
| GET `/calls/report` | `outletId`, `startDate:ms`, `endDate:ms`, `department?`, `search?`; range max one day | call report |
| GET `/calls` | above dates plus required `receiverName`; `direction?`, `limit?=50`, `cursor?` | call page |
| POST `/calls` | `CallCreate` | `201`; created/deduplicated call result |
| GET `/calls/:callId` | query `outletId` | call detail |
| GET `/leads/:leadId/calls` | `outletId`, `limit?=30`, `cursor?` | lead call page |

`CallCreate`:

```json
{
  "outletId": "uuid",
  "leadId": "optional-uuid",
  "customerId": "optional-uuid",
  "loggedByUserId": "optional-uuid",
  "direction": "outgoing",
  "durationSeconds": 90,
  "number": "9876543210",
  "receiverMobileNo": "9876543210",
  "receiverName": "Jane",
  "name": "Employee label",
  "department": "Sales",
  "timestamp": 1790631000000,
  "phoneAccountId": "optional",
  "simLabel": "SIM 1",
  "simPhoneNumber": "+919876543210",
  "subscriptionId": "optional",
  "deviceId": "optional",
  "externalCallSource": "android",
  "externalCallId": "device-call-id"
}
```

## 7. Attendance and biometric ingest

Normal attendance endpoints require bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| GET `/attendance/daily` | `outletId`, `date` (`date` or `ms`) | daily attendance |
| GET `/attendance/monthly` | `outletId`, `month`, `includeSalary?=false` | monthly attendance |
| POST `/attendance/events` | event body below | attendance ingestion result |
| DELETE `/attendance/:attendanceId` | query `outletId` | `202`; deletion result |

```json
{
  "outletId": "uuid",
  "userId": "uuid",
  "deviceId": "device-1",
  "deviceUserId": "optional",
  "eventType": "IN",
  "timestamp": 1790631000000,
  "source": "mobile",
  "externalEventId": "optional-idempotency-id"
}
```

Biometric device endpoint (not user JWT): `POST /attendance/biometric/transactions`, with `Authorization: Bearer <BIOMETRIC_INGEST_TOKEN>`.

```json
{
  "outletId": "uuid",
  "trans": [{
    "txnId": "1",
    "punchId": "employee-device-id",
    "mode": "IN",
    "txnDateTime": "2026-09-29T09:00:00+05:30",
    "dvcId": "optional",
    "dvcIP": "optional",
    "integrationKey": "optional"
  }]
}
```

Response is not wrapped: `{ "transStatus": [{"txnId":"1","status":1}] }`. Maximum 100 transactions.

## 8. Leave, balances, and holidays

Requires bearer auth and selector header. These routes are available under `/attendance/leaves` and most are also mirrored under `/leave`; use `/attendance/leaves` in new mobile code.

| Method and path (prefix `/attendance/leaves`) | Request | Response data |
|---|---|---|
| GET `/types` | `outletId` | leave types |
| POST `/types` | `{outletId,name,shortCode}` | `201`; leave type |
| GET `/balances` | `outletId`, `year`, `userId?` | balances |
| GET `/balances/:userId/history` | `outletId`, `year`, `limit?=50` | balance history |
| PATCH `/balances/:userId` | `{outletId,year,totalLeaves,reason}` | updated balance |
| GET `/holidays` | `outletId`, `year:YYYY` | holidays |
| POST `/holidays` | `HolidayCreate` | `201`; holiday |
| PATCH `/holidays/:holidayId` | partial `HolidayCreate`; `outletId` required | updated holiday |
| DELETE `/holidays/:holidayId` | query `outletId` | deletion result |
| POST `/requests` | `LeaveRequest` | `201`; request |
| GET `/requests` | `outletId`, `month`, `status:REQUESTED\|APPROVED\|REJECTED`, `limit?=30`, `cursor?` | leave page |
| PATCH `/:leaveId/status` | `{outletId,status:APPROVED\|REJECTED,remark?=""}` | updated leave |

`HolidayCreate`:

```json
{
  "outletId": "uuid",
  "title": "Holiday",
  "date": "2026-10-02",
  "type": "NATIONAL",
  "isPaid": true,
  "description": "",
  "applicableStates": [],
  "applicableOutlets": []
}
```

Holiday types: `NATIONAL|OPTIONAL|REGIONAL`.

`LeaveRequest`:

```json
{
  "outletId": "uuid",
  "leaveTypeId": "uuid",
  "fromDate": 1790631000000,
  "toDate": 1790717400000,
  "duration": "Full Day",
  "leaveNote": "Reason"
}
```

Duration: `Full Day|Half Day`.

## 9. Team tree

Requires bearer auth and selector header.

Roles: `USER|SUPER_ADMIN|SUB_SUPER_ADMIN|ADMIN|SUPPORT|MANAGER`. Departments: `SALES|IT|HR|ACCOUNT|SUPPORT|HARDWARE`.

| Method and path | Request | Response data |
|---|---|---|
| GET `/team-tree/users` | `outletId`, `department?`, `zone?`, `active?:true\|false`, `search?`, `limit?=50`, `cursor?:uuid` | team page |
| POST `/team-tree/users` | `TeamCreate` | `201`; team member |
| GET `/team-tree/users/:userId` | query `outletId` | member detail |
| PATCH `/team-tree/users/:userId` | `TeamUpdate` | member detail |
| POST `/team-tree/users/:userId/memberships` | `TeamMembership` | `201`; membership |

`TeamCreate`:

```json
{
  "outletId": "uuid",
  "name": "Employee",
  "email": "employee@example.com",
  "phoneNumber": "+919876543210",
  "password": "minimum-10-characters",
  "department": "SALES",
  "roleInZone": "USER",
  "zoneList": ["SOUTH"],
  "managerUserId": "optional-uuid",
  "teamHeadProfileId": "optional-uuid",
  "zoneHeadProfileId": "optional-uuid",
  "empCode": "EMP001",
  "isOnPayRoll": true,
  "isActive": true
}
```

Email or phone is required. `TeamMembership` is the same without name/email/phone/password. `TeamUpdate` requires `outletId` and `department`; all of `currentDepartment`, `roleInZone`, `zoneList`, nullable manager/team-head IDs, `empCode`, `isOnPayRoll`, `isActive` are optional.

## 10. Tasks

Requires bearer auth. Selector header is safe but not required by this router.

Statuses: `OPEN|ASSIGNED|IN_PROGRESS|BLOCKED|COMPLETED|CANCELLED`. Priorities: `LOW|MEDIUM|HIGH|URGENT`. Updates use optimistic concurrency through `version`.

| Method and path | Request | Response data |
|---|---|---|
| GET `/tasks` | `outletId`, `status?`, `priority?`, `assignedTo?:uuid\|me`, `q?`, `dueFrom?`, `dueTo?`, `includeDeleted?=false`, `limit?=30`, `cursor?` | `{items:Task[],nextCursor}` |
| POST `/tasks` | `TaskCreate` | `201`; task |
| GET `/tasks/:taskId` | query `outletId` | task |
| GET `/tasks/:taskId/history` | `outletId`, `limit?=30`, `cursor?` | `{items:TaskHistory[],nextCursor}` |
| PATCH `/tasks/:taskId` | `TaskUpdate` | task |
| PATCH `/tasks/:taskId/status` | `{outletId,version,status,progressPercent?,reason?=""}` | task |
| DELETE `/tasks/:taskId` | `outletId`, `version` in query | deletion result |

`TaskCreate`:

```json
{
  "outletId": "uuid",
  "title": "Call customer",
  "description": "",
  "taskType": "GENERAL",
  "priority": "MEDIUM",
  "assignedToUserId": "optional-uuid",
  "taskDate": "2026-09-29",
  "dueAt": "2026-09-29T17:30:00+05:30",
  "outletTimeZone": "Asia/Kolkata"
}
```

`TaskUpdate`: `outletId`, current `version`, plus at least one of `title`, `description`, `taskType`, `priority`, nullable `assignedToUserId`, `taskDate`, `dueAt`, `outletTimeZone`.

## 11. Products and categories

Requires bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| POST `/products/categories` | `{outletId?,name,description?=""}` | `201`; category |
| GET `/products/categories` | `outletId?`, `includeDeleted?=false` | categories |
| PATCH `/products/categories/:categoryId` | `{outletId?,name?,description?,active?}` | category |
| DELETE `/products/categories/:categoryId` | none | archive result |
| POST `/products` | `ProductCreate` | `201`; product |
| GET `/products` | `outletId?`, `categoryId?`, `search?`, `limit?=50`, `cursor?`, `includeDeleted?=false` | product page |
| GET `/products/search` | `outletId?`, `query`, `limit?=20` | products |
| GET `/products/:productId` | none | product |
| PATCH `/products/:productId` | partial `ProductCreate` plus `active?` | product |
| DELETE `/products/:productId` | none | archive result |

`ProductCreate`:

```json
{
  "outletId": "optional-uuid",
  "outletIds": ["optional-uuid"],
  "name": "Product",
  "sku": "SKU-1",
  "brand": "Brand",
  "categoryId": "optional-uuid-or-null",
  "category": "optional name",
  "description": "",
  "mrpPrice": 120,
  "price": 100,
  "purchasePrice": 80,
  "taxPercent": 18,
  "isAddOn": false,
  "minUnit": {"length":"","width":"","height":"","weight":"","volume":""},
  "uidMap": {"GTIN":"","ISBN":null,"BatchId":"","QRCode":"","IMEI":null,"SerialNumber":null,"MACAddress":null,"VIN":null,"RFID":null},
  "customFields": {}
}
```

Only `name` is structurally required. Prices cannot be negative; tax is 0–100.

## 12. Warehouses and inventory

Requires bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| POST `/warehouses` | `{outletId,name,code?="",address?=""}` | `201`; warehouse |
| GET `/warehouses` | `outletId?`, `includeDeleted?=false` | warehouses |
| GET `/warehouses/:warehouseId` | none | warehouse |
| PATCH `/warehouses/:warehouseId` | `{outletId?,name?,code?,address?,active?}` | warehouse |
| DELETE `/warehouses/:warehouseId` | none | archive result |
| GET `/inventory/stock` | `outletId?`, `warehouseId?`, `productId?` | stock items |
| GET `/inventory/ledger` | same plus `limit?=50` | ledger entries |
| POST `/inventory/adjustments` | adjustment body | `201`; adjustment/result |
| POST `/inventory/transfers` | transfer body | `201`; transfer |
| GET `/inventory/transfers` | `outletId?`, `status?`, `limit?=50` | transfers |
| GET `/inventory/transfers/:transferId` | none | transfer detail |
| POST `/inventory/transfers/:transferId/action` | action body | updated transfer |

Adjustment:

```json
{
  "outletId": "uuid",
  "warehouseId": "uuid",
  "adjustmentType": "CORRECTION",
  "reason": "Stock count",
  "items": [{"productId":"uuid","newQuantity":10}]
}
```

Adjustment types: `CORRECTION|COUNT|DAMAGE|EXPIRED|OTHER`.

Transfer:

```json
{
  "outletId": "uuid",
  "productId": "uuid",
  "fromWarehouseId": "uuid",
  "toWarehouseId": "uuid",
  "requestedQuantity": 5,
  "remarks": ""
}
```

Action:

```json
{
  "outletId": "optional-uuid",
  "action": "PARTIAL_ACCEPT",
  "acceptedQuantity": 3,
  "rejectionReason": "required only for REJECT",
  "remarks": "optional"
}
```

Actions: `ACCEPT|REJECT|PARTIAL_ACCEPT`; list statuses: `PENDING|ACCEPTED|REJECTED|PARTIALLY_ACCEPTED`.

## 13. Expenses and budgets

Requires bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| GET `/expense-budgets/summary` | `outletId`, `month` | budget summary |
| POST `/expense-budgets` | budget create | `201` if created else `200`; allocation result |
| PATCH `/expense-budgets/:allocationId` | `{outletId,allocatedAmount,notes?}` | allocation |
| GET `/expense-budgets/:allocationId/transactions` | `outletId`, `limit?=25`, `cursor?:uuid` | transaction page |
| GET `/expenses` | `outletId`, `startDate:ms`, `endDate:ms` | `{items}` |
| POST `/expenses` | expense create | `201`; `{item}` |
| PATCH `/expenses/:expenseId/status` | status body | expense/status result |
| GET `/expenses/:expenseId/status-history` | `outletId`, `limit?=25`, `cursor?:uuid` | status history |
| DELETE `/expenses/:expenseId` | query `outletId` | deletion result |

Budget create:

```json
{
  "outletId": "uuid",
  "month": "2026-09",
  "targetType": "DEPARTMENT",
  "targetId": "SALES",
  "allocatedAmount": 50000,
  "notes": "optional"
}
```

Target types: `DEPARTMENT|USER|MANAGER_TEAM`; amounts have at most two decimals.

Expense create:

```json
{
  "outletId": "uuid",
  "userId": "optional-uuid",
  "amount": 1250.5,
  "monthId": "2026-09",
  "categoryId": "optional-uuid",
  "purpose": "Travel",
  "createdDate": 1790631000000,
  "details": {}
}
```

Status body: `{outletId,status:REVIEWED|APPROVED|REJECTED,rejectionReason?}`; rejection reason is required for `REJECTED`.

## 14. Payroll

Requires bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| GET `/payroll/employee` | `outletId`, `employeeId`, `year?` | employee payroll data |
| GET `/payroll/overview` | `outletId` | overview |
| GET `/payroll/statutory-rules` | `outletId`, `state?`, `month?`, `grossSalary?`, `gender?` | statutory rules |
| POST `/payroll/preview` | preview body | calculated preview |
| PATCH `/payroll/salary-structure` | preview body + required `salaryStructure`, `effectiveFrom:date` | saved structure |
| POST `/payroll/runs` | `{outletId,employeeId,month:1..12,year:2000..2100,adjustments?}` | `201` if created else `200`; payroll run |

Preview body:

```json
{
  "outletId": "uuid",
  "employee": {
    "id": "uuid",
    "userProfileId": "optional-uuid",
    "name": "Employee",
    "empCode": "EMP001",
    "designation": "Executive",
    "department": "SALES",
    "workLocationState": "Maharashtra",
    "dateOfJoining": "2024-01-01",
    "gender": "UNSPECIFIED"
  },
  "salaryStructure": {
    "salaryType": "MONTHLY",
    "grossSalary": 50000,
    "earnings": {
      "basic": 20000,
      "hra": 10000,
      "da": 0,
      "conveyance": 2000,
      "medical": 1000,
      "specialAllowance": 15000,
      "incentive": 0,
      "overtime": 0,
      "bonus": 0,
      "arrears": 0,
      "otherEarnings": 2000
    }
  },
  "month": 9,
  "year": 2026,
  "adjustments": {
    "loanDeduction": 0,
    "advanceDeduction": 0,
    "otherDeduction": 0,
    "incentive": 0,
    "arrears": 0
  }
}
```

Employee also accepts optional PF/ESI/gratuity/minimum-wage fields defined in `backend/src/validators/payroll.validator.ts`. Salary structure additionally supports `ctc`, daily/hourly rates, deductions, payroll option booleans, and attendance settings. Gender: `FEMALE|MALE|OTHER|UNSPECIFIED`.

## 15. Access control and outlet features

Requires bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| GET `/access-control/permissions` | `outletId` | permissions |
| POST `/access-control/permissions` | permission body | `201`; permission |
| PATCH `/access-control/permissions/:resourceId` | permission update | permission |
| DELETE `/access-control/permissions/:resourceId` | query `outletId` | deletion result |
| GET `/access-control/users` | `outletId` | permission users |
| GET `/access-control/users/:resourceId` | `outletId` | user access detail |
| PATCH `/access-control/users/:resourceId` | user access body | updated access |
| GET `/access-control/outlets` | `outletId` | manageable outlets |
| GET `/access-control/outlets/:targetOutletId/features` | `outletId`, `includeUserCount?:true\|false` | feature configuration |
| PATCH `/access-control/outlets/:targetOutletId/features` | feature update body | updated feature configuration |

Permission create: `{outletId,key,label,description,category}`. Update omits `key` but otherwise requires those fields. Keys are uppercase `CRM_*` style or lowercase dotted keys.

User access: `{outletId,role,departmentAccessList:string[],outletPermissions:string[]}`.

Feature update: `{outletId,enabledFeatureKeys:string[],expectedRevision?:number}`.

## 16. Outlets and plan catalog

Requires bearer auth. Selector header is safe but not required.

| Method and path | Request | Response data |
|---|---|---|
| GET `/outlets` | none | `{items}` |
| POST `/outlets` | `OutletCreate` | `201`; `{outlet,subscription}` |
| GET `/outlets/:outletId` | none | `{outlet,subscription}` |
| PATCH `/outlets/:outletId` | at least one of `name`, `branch`, `address`, `city`, `state` | outlet |
| GET `/outlets/plans/catalog` | none | `{features}` |
| PUT `/outlets/plans/catalog` | `{features: PlanFeature[]}` | `{features}` |

`PlanFeature`: `{id,label,tier:silver|gold|platinum,source:default|sidebar,featureKey?}`.

`OutletCreate`:

```json
{
  "businessId": "optional-uuid",
  "name": "Pune Central Store",
  "branch": "Main Branch",
  "address": "12 Market Road",
  "city": "Pune",
  "state": "Maharashtra",
  "latitude": 18.5204,
  "longitude": 73.8567
}
```

`businessId` may be omitted when the caller has one active business. `branch`
and `address` default to `""`; coordinates are optional and default to zero.
Only a tenant administrator can create an outlet. The server validates the
business within the current tenant, generates the outlet code, assigns the
caller, and provisions the trial subscription and default features atomically.
Accounts linked to multiple active businesses must provide `businessId`.

## 17. User location tracking

Requires bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| GET `/user-tracking/history` | `outletId`, `userId`, `date`, `limit?=250` (25–500), `cursor?` | tracking page |
| POST `/user-tracking/points` | point body | `201`; stored/deduplicated point |

```json
{
  "outletId": "uuid",
  "userId": "optional-uuid; defaults to caller where allowed",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "address": "",
  "name": "",
  "timestamp": 1790631000000,
  "accuracyMeters": 10,
  "deviceId": "device-id",
  "externalSource": "android",
  "externalId": "idempotency-id"
}
```

## 18. WhatsApp chat persistence

Requires bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| GET `/whatsapp/chats` | `outletId`, `startDate?:ms`, `limit?=50`, `cursor?` | conversation page |
| POST `/whatsapp/chats/events` | inbound or status event | `202`; ingest result |
| POST `/whatsapp/chats/:conversationId/messages` | `{outletId,text,contentType?:text\|document}` | `201`; conversation; provider failure uses `502 WHATSAPP_SEND_FAILED` |
| PATCH `/whatsapp/chats/:conversationId/read` | `{outletId}` | updated conversation/read result |

Inbound event:

```json
{
  "eventType": "INBOUND",
  "outletId": "uuid",
  "mobile": "919876543210",
  "integratedNumber": "optional",
  "messageUuid": "provider-message-id",
  "contentType": "text",
  "text": "Hello",
  "url": "https://optional-document-url",
  "customerName": "optional",
  "repliedMessageId": "optional",
  "occurredAt": 1790631000000
}
```

Status event: `{eventType:"STATUS",outletId,mobile,messageUuid,status:sent|delivered|read|failed,failureReason?,occurredAt?}`.

## 19. AI contact jobs and generated-contact imports

AI job routes require bearer auth; selector header is safe but not required.

| Method and path | Request | Response data |
|---|---|---|
| GET `/ai-contacts/jobs` | `outletId` | jobs |
| POST `/ai-contacts/jobs` | job body | `201`; job |
| PATCH `/ai-contacts/jobs/:jobId` | query `outletId`; partial job body | job |
| DELETE `/ai-contacts/jobs/:jobId` | query `outletId` | deletion result |

Job body: `{outletId,keywords:string[1..100],category?="",city?="",contactLimit?=100}`. Update omits `outletId` and accepts any non-empty subset plus `status:pending|processing|completed|failed`.

Generated-contact routes require bearer auth and selector header.

| Method and path | Request | Response data |
|---|---|---|
| GET `/generated-contacts/imports` | `outletId`, `month?` | imports |
| POST `/generated-contacts/import` | import body | `201`; import result |
| GET `/generated-contacts/imports/:importId/contacts` | `outletId`, `month?` | import contacts |
| PATCH `/generated-contacts/contacts/:contactId/assignee` | `{outletId,assignedUserId,reason?}` | contact |
| DELETE `/generated-contacts/contacts/:contactId` | `outletId`, `month?` | deletion result |

Import body core:

```json
{
  "outletId": "uuid",
  "importId": "client-import-id",
  "fileName": "contacts.xlsx",
  "worksheetName": "Sheet1",
  "uploadedAt": 1790631000000,
  "uploadType": "OTHER",
  "uploadName": "September contacts",
  "contacts": [{
    "rowNumber": 2,
    "values": {"Name":"Jane","Phone":"9876543210"},
    "assignedUserId": "uuid",
    "assignedUserName": "Sales User",
    "assignedEmployeeCode": "EMP001"
  }]
}
```

Maximum 100 contacts per request. For `uploadType:EVENT`, an `event` object is required (event identity, description, terms, location/address, date/expiry, fees, images, status, registration counts/link). For `OTHER`, `event` must be omitted.

## 20. Reference geography

Requires bearer auth. Selector header is safe but not required. Common query: `activeOnly?=true`, `q?=""`, `limit?=250` (max 1000).

| Method and path | Extra query | Response data |
|---|---|---|
| GET `/reference-data/countries` | none | country items |
| GET `/reference-data/states` | `countryCode?=IN` | state items |
| GET `/reference-data/cities` | `stateCode?` | city items |
| GET `/reference-data/zones` | none | zone items |

## 21. Event gateway (PostgreSQL when storage backend is PostgreSQL)

These endpoints currently have no user-auth middleware. Treat them as public/payment endpoints and never place PhonePe secrets in the app. Their result is returned directly rather than guaranteed to use the standard envelope.

| Method and path | Request | Response |
|---|---|---|
| POST `/event/create` | event body | gateway create result |
| GET `/event/get` | `outletId`, `eventId?`, `isActive?:true\|false`, `fromDate?`, `toDate?` | event(s) |
| GET `/event/transactions/get` | `outletId`, `eventId?` | transactions |
| POST `/event/payAndRegister` | payment-init body | PhonePe/payment registration result |
| POST `/event/status` | status body | payment status result |
| POST `/event/statusOld` | same as `/status` (legacy alias) | payment status result |

Event create core: `{eventId,outletId,title?,description?,terms?,dateTime?,expiryDate?,address?,location?,postLink?,fees?,isActive?,members?,imageUrl?,offer?,imageList?}`. Unknown fields are accepted here.

Payment init: `{outletId,eventId,transactionId,merchantOrderId,amount>0,isProd,customerPhoneNumber,mobile?,...memberFields}`.

Status: `{eventId,transactionId,amount,outletId,isProd,mobile,transactionType?,transactionTitle?,...memberFields}`.

## 22. Mobile implementation checklist

1. Keep `accessToken` in secure device storage; never log it.
2. Use a cookie-aware HTTP client for the HttpOnly refresh cookie. On iOS/Android, verify cookies are retained across app restarts if persistent login is required.
3. Add `X-Postgres-Session: 1` globally. It is harmless on routes that do not inspect it and essential on compatibility routes.
4. On `401 INVALID_AUTH_TOKEN`, perform one synchronized refresh, replace the access token, and retry the original request once.
5. Persist `context.tenantId` and available `outletIds`, but send the selected `outletId` exactly where each contract requires it.
6. Treat cursors as opaque strings. Do not parse or manufacture them.
7. Send epoch timestamps in milliseconds, never seconds.
8. Send money as JSON numbers; budget amounts allow at most two decimal places.
9. Respect task `version` and outlet-feature `expectedRevision` conflicts instead of silently overwriting newer data.
10. Do not expose biometric ingest tokens, payment credentials, or provider webhooks in a general-user mobile build.

### Minimal request example

```ts
const response = await fetch(`${API_BASE}/api/v1/customers?outletId=${outletId}`, {
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-Postgres-Session": "1",
  },
  credentials: "include",
});

const payload = await response.json();
if (!response.ok || !payload.success) {
  throw new Error(`${payload.code ?? response.status}: ${payload.message ?? "Request failed"}`);
}
```
