# SENSIBLE POS — FIRESTORE COST & USAGE FORENSIC AUDIT

## BUSINESS CONTEXT

Sensible POS currently serves 5,000+ customers.

The existing POS system uses Firebase / Cloud Firestore as its operational
database.

Firestore is a critical production system for the POS business.

The objective of this task is NOT to migrate away from Firestore.

The objective is to understand exactly how Firestore is being used,
what is generating our costs, what is necessary for POS operations,
what may be inefficient, and where we can safely optimize.

CUSTOMER DATA, BILLING, SUBSCRIPTIONS, LOGIN, POS OPERATIONS,
DEVICE OPERATIONS AND PRODUCTION RELIABILITY MUST NOT BE AFFECTED.

---

# PRIMARY OBJECTIVE

Perform a complete forensic audit of the POS Firestore architecture,
usage and cost.

We need to answer:

1. How much Firestore data do we actually have?
2. Which collections contain the most data?
3. Where are Firestore reads coming from?
4. Where are Firestore writes coming from?
5. Which features generate the most reads?
6. Which features generate the most writes?
7. Which queries are inefficient?
8. Which realtime listeners generate significant reads?
9. Are there duplicate or unnecessary reads?
10. Are there duplicate or unnecessary writes?
11. What is generating storage growth?
12. What is generating backup storage?
13. What is generating PITR storage?
14. What is generating SMS costs?
15. What is generating network/data-transfer costs?
16. Which costs are necessary for POS?
17. Which costs are potentially unnecessary?
18. What can be optimized safely?
19. What should NOT be changed?
20. What is the expected monthly saving from each optimization?

---

# CRITICAL RULE

THIS IS A READ-ONLY FORENSIC AUDIT.

DO NOT IMPLEMENT CHANGES.

DO NOT MODIFY PRODUCTION.

DO NOT DELETE DATA.

DO NOT MIGRATE DATA.

DO NOT DISABLE PITR.

DO NOT CHANGE BACKUP RETENTION.

DO NOT CHANGE FIREBASE AUTH.

DO NOT CHANGE FIRESTORE INDEXES.

DO NOT CHANGE POS BEHAVIOUR.

DO NOT CHANGE CUSTOMER DATA.

DO NOT CHANGE SUBSCRIPTIONS.

DO NOT CHANGE BILLING LOGIC.

First understand the system.

Then measure.

Then identify root causes.

Then recommend.

Implementation will happen only after separate approval.

---

# PART 1 — FIRESTORE DATABASE INVENTORY

Inspect the complete codebase and identify:

- Firebase projects
- Firestore databases
- Database regions
- Collections
- Subcollections
- Major document structures
- Important document types
- Approximate document counts where available
- Largest collections
- Storage-heavy collections
- Historical collections
- Log collections
- Audit collections
- Temporary collections
- Cache collections
- Index definitions
- Composite indexes
- Single-field index configuration
- TTL configuration if present

Create:

/docs/firestore-cost-audit/database-inventory.md

Document:

Collection
Purpose
Approximate size
Approximate document count
Read activity
Write activity
Importance to POS
Retention requirement
Potential optimization

Do not delete anything.

---

# PART 2 — FIRESTORE READ FORENSICS

Perform a complete investigation of Firestore reads.

Search the entire codebase for all Firestore read patterns including:

- get()
- getDoc()
- getDocs()
- onSnapshot()
- collection()
- doc()
- query()
- where()
- orderBy()
- limit()
- count()
- aggregate queries
- realtime listeners
- polling
- repeated fetches
- background reads
- scheduled reads
- report queries
- dashboard queries
- mobile reads
- device reads
- synchronization reads

For every significant read pattern determine:

- Feature
- Screen/module
- Collection
- Query
- Trigger
- Frequency
- Number of documents returned
- Realtime listener or normal query
- Whether listener is correctly unsubscribed
- Whether the same data is repeatedly requested
- Whether the query is necessary
- Potential optimization

Pay special attention to:

- POS billing screen
- Product lookup
- Customer lookup
- Inventory
- Reports
- Dashboards
- Synchronization
- Device communication
- Background processes
- Mobile applications
- Admin screens
- Search
- Analytics

Create:

/docs/firestore-cost-audit/read-audit.md

---

# PART 3 — FIRESTORE WRITE FORENSICS

Perform a complete investigation of Firestore writes.

Search for:

- addDoc()
- setDoc()
- updateDoc()
- deleteDoc()
- batch writes
- transactions
- loops
- retries
- synchronization processes
- background workers
- scheduled jobs
- listeners triggering writes
- audit/history generation
- status updates
- timestamp updates
- analytics writes
- device-generated writes

For every significant write pattern determine:

- Feature
- Collection
- Code location
- Trigger
- Frequency
- Number of documents written
- Reason for write
- Duplicate-write possibility
- Retry behaviour
- Loop behaviour
- Whether the write is necessary
- Potential optimization

Pay special attention to repeated writes caused by:

- loops
- retries
- listeners
- polling
- synchronization
- device communication
- background jobs
- unnecessary timestamp updates
- writing the same value repeatedly

Create:

/docs/firestore-cost-audit/write-audit.md

---

# PART 4 — STORAGE FORENSICS

Determine what is actually consuming Firestore storage.

Inspect:

- Largest collections
- Largest documents
- Largest fields
- Repeated data
- Duplicate data
- Historical data
- Logs
- Audit records
- Temporary records
- Cache data
- Unused collections
- Unused fields
- Index-heavy collections
- Large arrays
- Large embedded objects
- Binary/base64 data if present

Identify:

1. Required operational data
2. Historical data
3. Data that could potentially be archived
4. Data that may be duplicated
5. Data that may be unnecessarily large

DO NOT delete or modify anything.

Create:

/docs/firestore-cost-audit/storage-audit.md

---

# PART 5 — FIRESTORE INDEX AUDIT

Inspect Firestore indexes.

Determine:

- Number of composite indexes
- Collections using them
- Whether indexes are required
- Potentially unused indexes
- Storage impact
- Queries dependent on each index
- Any redundant index definitions

Do NOT remove indexes.

Only identify candidates for review.

Create:

/docs/firestore-cost-audit/index-audit.md

---

# PART 6 — BACKUP FORENSICS

Inspect the actual Firestore backup configuration.

Document:

- Backup schedules
- Daily backups
- Weekly backups
- Retention periods
- Current backup storage
- Backup size
- Database size at backup time
- Historical retention configuration if available
- Current monthly backup cost
- Expected effect of retention changes

If retention has recently been reduced, document:

BEFORE
Retention:
Backup storage:
Monthly cost:

AFTER
Retention:
Backup storage:
Monthly cost:

EXPECTED SAVING
₹ / month

ACTUAL SAVING
₹ / month

If the required information is unavailable, clearly state:

REQUIRES GCP CONSOLE / BILLING DATA

Do not guess.

Do not change backup configuration.

Create:

/docs/firestore-cost-audit/backup-audit.md

---

# PART 7 — PITR FORENSICS

Inspect Point-in-Time Recovery configuration.

Determine:

- Is PITR enabled?
- Which database?
- Current configuration
- Current PITR storage
- Monthly PITR cost
- Business recovery requirement
- Required recovery window
- Whether current configuration is justified

IMPORTANT:

DO NOT DISABLE PITR.

The purpose is to understand the cost and business value first.

Clearly document:

CURRENT STATE
BUSINESS PURPOSE
COST
RISK
RECOMMENDATION

Create:

/docs/firestore-cost-audit/pitr-audit.md

---

# PART 8 — SMS FORENSICS

Investigate all SMS-related functionality.

Determine:

- Firebase Authentication SMS
- OTP requests
- OTP resend
- Failed OTP requests
- Repeated OTP requests
- Verification attempts
- Test/staging SMS
- Country/region usage
- Other SMS providers
- Code responsible for triggering SMS

Do not assume the source of SMS costs.

PROVE THE SOURCE.

Create:

/docs/firestore-cost-audit/sms-audit.md

---

# PART 9 — NETWORK / DATA TRANSFER FORENSICS

Investigate:

- Firestore internet data transfer
- Firestore response sizes
- Large document downloads
- Repeated downloads
- Client-to-Firestore traffic
- Backend-to-Firestore traffic
- Cross-region traffic
- External API traffic
- Unnecessary payloads

Identify features responsible for significant network usage.

Create:

/docs/firestore-cost-audit/network-audit.md

---

# PART 10 — FIRESTORE SECURITY & ACCESS PATTERN AUDIT

Inspect:

- Firebase Authentication
- Firestore Security Rules
- Client-side Firestore access
- Backend Firestore access
- Service accounts
- Admin SDK usage
- Role-based access
- Tenant/customer isolation
- POS customer data boundaries

Identify:

- Direct client access
- Backend access
- Administrative access
- Risky access patterns
- Unnecessary access
- Potential security weaknesses

DO NOT change security rules.

DO NOT change authentication.

Only report findings.

Create:

/docs/firestore-cost-audit/security-audit.md

---

# PART 11 — POS ARCHITECTURE AUDIT

Map the actual production architecture.

Show:

USER / POS DEVICE
        ↓
APPLICATION
        ↓
FIREBASE AUTH
        ↓
FIRESTORE
        ↓
OTHER GCP / FIREBASE SERVICES

Identify:

- Which features depend on Firestore
- Which features require realtime data
- Which features require offline capability
- Which features perform frequent reads
- Which features perform frequent writes
- Which features depend on transactions
- Which features depend on batch writes
- Which features depend on listeners

Classify each major Firestore usage pattern:

A. CRITICAL FOR POS
B. REQUIRED BUT OPTIMIZABLE
C. POTENTIALLY INEFFICIENT
D. UNNECESSARY / DUPLICATE
E. REQUIRES MORE DATA

Create:

/docs/firestore-cost-audit/architecture-audit.md

---

# PART 12 — BILLING CORRELATION

Compare the codebase findings with actual GCP billing data.

Investigate these SKUs separately:

- Firestore Reads
- Firestore Writes
- Firestore Deletes
- Firestore Storage
- Firestore Backup Storage
- Firestore PITR Storage
- Firestore Network/Data Transfer
- Firebase Authentication SMS
- Other Firebase/GCP services directly related to POS

For every major cost:

SKU
Usage
Monthly Cost
What Generates It
Relevant Feature
Relevant Code
Root Cause
Necessary for POS?
Optimization Opportunity
Expected Saving
Risk

IMPORTANT:

Do not claim a code path causes a billing SKU unless there is evidence.

Clearly distinguish:

CODE EVIDENCE
BILLING EVIDENCE
CONFIGURATION EVIDENCE
INFERENCE
RECOMMENDATION

Create:

/docs/firestore-cost-audit/cost-correlation.md

---

# PART 13 — TOP COST DRIVERS

Rank the top cost drivers.

Example:

1. Backup Storage
2. Firestore Reads
3. Firestore Writes
4. PITR
5. Firestore Storage
6. SMS
7. Network

But do NOT assume this order.

Use actual billing evidence.

For each:

Current usage
Current cost
Trend
Root cause
POS dependency
Optimization opportunity
Risk

---

# PART 14 — TOP 20 OPTIMIZATION OPPORTUNITIES

Create a ranked list of the top 20 potential optimizations.

Columns:

Rank
Problem
Current Usage
Current Cost
Root Cause
Recommended Action
Expected Saving
Engineering Effort
Customer Risk
Priority

Classify every recommendation:

SAFE
LOW RISK
MEDIUM RISK
HIGH RISK

Do not implement any recommendation.

---

# PART 15 — WHAT WE MUST NOT CHANGE

Create a dedicated section listing things that should not be changed
without explicit approval.

Examples may include:

- Production Firestore data
- Customer records
- Billing records
- POS transaction records
- Authentication
- Subscription logic
- Security rules
- PITR
- Backup configuration
- Firestore indexes
- Realtime listeners
- Offline functionality
- Device synchronization
- POS billing workflows

The final list must be based on actual codebase findings.

---

# PART 16 — COST OPTIMIZATION PLAN

Create a practical action plan:

PHASE 1
Measurement

PHASE 2
Root Cause

PHASE 3
Safe Optimization

PHASE 4
Validation

PHASE 5
Production Rollout

PHASE 6
Post-optimization Cost Measurement

Every proposed change must include:

- Problem
- Proposed change
- Expected saving
- Customer impact
- Risk
- Rollback plan
- Validation method

---

# PART 17 — FINAL EXECUTIVE REPORT

Create:

/docs/firestore-cost-audit/README.md

The README must contain:

1. Executive Summary
2. Current POS Architecture
3. Firestore Database Inventory
4. Cost Breakdown
5. Read Analysis
6. Write Analysis
7. Storage Analysis
8. Index Analysis
9. Backup Analysis
10. PITR Analysis
11. SMS Analysis
12. Network Analysis
13. Security Analysis
14. Architecture Findings
15. Top Cost Drivers
16. Top 20 Optimization Opportunities
17. Expected Savings
18. Risks
19. What Must Not Be Changed
20. Recommended Action Plan
21. Required GCP Console Measurements
22. Final Conclusion

---

# REQUIRED FINAL SUMMARY

At the very end provide:

## A. 10 BIGGEST FINDINGS

## B. 10 BIGGEST COST-REDUCTION OPPORTUNITIES

## C. 10 SAFEST OPTIMIZATIONS

## D. 5 HIGHEST-RISK CHANGES TO AVOID

## E. ESTIMATED MONTHLY SAVING RANGE

## F. REQUIRED GCP CONSOLE / BILLING DATA

## G. REQUIRED ENGINEERING ACTIONS

## H. ITEMS REQUIRING MANAGEMENT APPROVAL

---

# ABSOLUTE RULES

AUDIT FIRST.

MEASURE FIRST.

DO NOT GUESS.

DO NOT MODIFY PRODUCTION.

DO NOT DELETE DATA.

DO NOT MIGRATE DATA.

DO NOT DISABLE PITR.

DO NOT CHANGE BACKUP RETENTION.

DO NOT CHANGE FIREBASE AUTH.

DO NOT CHANGE SECURITY RULES.

DO NOT CHANGE INDEXES.

DO NOT CHANGE POS BEHAVIOUR.

DO NOT IMPLEMENT OPTIMIZATIONS.

ONLY INVESTIGATE, DOCUMENT, CORRELATE, AND RECOMMEND.

Any missing information must be explicitly marked:

"REQUIRES GCP CONSOLE / BILLING DATA"

Never invent usage numbers or savings.

The final purpose of this audit is:

KEEP THE POS STABLE.
UNDERSTAND FIRESTORE COMPLETELY.
FIND THE ROOT CAUSES OF COST.
REDUCE UNNECESSARY COST.
PROTECT 5,000+ CUSTOMERS.

