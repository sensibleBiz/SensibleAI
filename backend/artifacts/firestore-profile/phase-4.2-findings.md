# Phase 4.2 Findings

Production source data was not modified. Sensitive credential values are excluded.

## P0

### LEADS_MANAGEMENT.__name__

- Actual: IDs longer than 64 characters
- Expected: legacy_id length <= 64
- Affected records: 241
- Recommended action: Amend contract width or introduce a lossless ID mapping
- Contract impact: Blocking VARCHAR(64) incompatibility

## P1

### ATTENDANCE.outletId

- Actual: Record scope disagrees with parent outlet
- Expected: Parent and embedded outlet IDs agree
- Affected records: 3
- Recommended action: Resolve ownership before migration
- Contract impact: Tenant isolation integrity risk

### LEAD_ACTIVITIES.status

- Actual: Unknown values: DEMO , HOLD, INSTALLATION
- Expected: Allowed: PENDING, DONE
- Affected records: 4
- Recommended action: Review values and approve ETL mapping; do not normalize source
- Contract impact: Enum amendment or mapping decision required

### TRANSFER_REQUEST.status

- Actual: Unknown values: ACCEPTED, PENDING
- Expected: Allowed: REQUESTED, APPROVED, REJECTED, COMPLETED, CANCELLED
- Affected records: 2
- Recommended action: Review values and approve ETL mapping; do not normalize source
- Contract impact: Enum amendment or mapping decision required

### ACTIVITY.newValue.assignedTo

- Actual: 1 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 1
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### ACTIVITY.oldValue.assignedTo

- Actual: 1 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 1
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### ATTENDANCE.outletId

- Actual: 3 orphan references to OUTLET
- Expected: Every logical reference resolves
- Affected records: 3
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### ATTENDANCE.userId

- Actual: 170 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 170
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### AUTOLEAD_ASSIGN.userId

- Actual: 1 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 1
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### EXPENSE.userId

- Actual: 2 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 2
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### LEADS_MANAGEMENT.assignedTo

- Actual: 387 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 387
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### LEADS_MANAGEMENT.customerId

- Actual: 2 orphan references to CUSTOMERS
- Expected: Every logical reference resolves
- Affected records: 2
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### LEADS_MANAGEMENT.leadRefId

- Actual: 241 orphan references to LEADS_MANAGEMENT
- Expected: Every logical reference resolves
- Affected records: 241
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### LEAD_ACTIVITIES.assignedTo

- Actual: 15 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 15
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### LEAVE_APPLICATION.managerId

- Actual: 36 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 36
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### LEAVE_BALANCE.managerId

- Actual: 6 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 6
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### LEAVE_BALANCE.userId

- Actual: 7 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 7
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### PAYROLL.employeeId

- Actual: 12 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 12
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### PAYROLL.attendanceSummary.employeeId

- Actual: 12 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 12
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### PUBLIC_URLS.userId

- Actual: 4 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 4
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### QR_SESSIONS.userId

- Actual: 3 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 3
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### SALARY_MASTER.userId

- Actual: 4 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 4
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### SALARY_MASTER.employeeId

- Actual: 28 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 28
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### USER_PROFILE.outletId

- Actual: 2 orphan references to OUTLET
- Expected: Every logical reference resolves
- Affected records: 2
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### UserExpenseBalance.userId

- Actual: 6 orphan references to USER_PROFILE
- Expected: Every logical reference resolves
- Affected records: 6
- Recommended action: Review and map or quarantine orphan records during ETL
- Contract impact: Foreign-key load would fail

### SHIFT

- Actual: No production records were available for empirical schema discovery
- Expected: Production samples sufficient to validate fields, types, relationships and values
- Affected records: 0
- Recommended action: Review the proposed amendment with POS owners and profile a representative fixture before creating SQL
- Contract impact: SHIFT contract remains provisional

## P2

### ATTENDANCE

- Actual: Mixed types in checkInLocation, checkOutLocation, createdDate
- Expected: One SQL-compatible type per field
- Affected records: 3647
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### CALL_LOGS

- Actual: Mixed types in deviceId, name, simLabel, simPhoneNumber, subscriptionId
- Expected: One SQL-compatible type per field
- Affected records: 55235
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### CONTACTS

- Actual: Mixed types in Type, address, category, email, eventDateTime, mobile, website
- Expected: One SQL-compatible type per field
- Affected records: 421
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### EVENTS

- Actual: Mixed types in dateTime, expiryDate, updatedAt
- Expected: One SQL-compatible type per field
- Affected records: 18
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### EXPENSE

- Actual: Mixed types in approvedAt, dateTime, rejectedAt, reviewedAt, totalKm
- Expected: One SQL-compatible type per field
- Affected records: 58
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### HOLIDAY

- Actual: Mixed types in date
- Expected: One SQL-compatible type per field
- Affected records: 22
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### INTEGRATION

- Actual: Mixed types in createdDate
- Expected: One SQL-compatible type per field
- Affected records: 18
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### LEADS_MANAGEMENT

- Actual: Mixed types in customerId, extraData.receiverMobile, leadDate, state
- Expected: One SQL-compatible type per field
- Affected records: 5932
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### LEAVE_APPLICATION

- Actual: Mixed types in remark
- Expected: One SQL-compatible type per field
- Affected records: 157
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### PRODUCT

- Actual: Mixed types in uidMap.ISBN, uidMap.SerialNumber, updatedAt
- Expected: One SQL-compatible type per field
- Affected records: 19
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### QR_SESSIONS

- Actual: Mixed types in userId
- Expected: One SQL-compatible type per field
- Affected records: 3372
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### USER_PROFILE

- Actual: Mixed types in created_time
- Expected: One SQL-compatible type per field
- Affected records: 105
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

### WHATSAPP_MESSAGES

- Actual: Mixed types in createdDateTime
- Expected: One SQL-compatible type per field
- Affected records: 10339
- Recommended action: Define explicit lossless ETL conversions
- Contract impact: Column conversion rules required

## P3

None.
