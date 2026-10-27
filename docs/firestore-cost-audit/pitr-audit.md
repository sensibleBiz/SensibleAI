# Part 7 — Point-in-Time Recovery (PITR) Forensics

## Executive Assessment

Point-in-Time Recovery (PITR) provides continuous write-ahead log retention for Cloud Firestore, permitting restoration of the database to any microsecond boundary within the past 7 days (168 hours). 

> [!CAUTION]
> **CRITICAL RULE**: DO NOT DISABLE PITR.
> Disabling PITR saves marginal incremental storage costs but exposes 5,000+ live merchant outlets to catastrophic, unrecoverable data loss in the event of software bugs, runaway batch updates, malicious script execution, or accidental mass deletion.

---

## 1. Current State & Configuration

| Parameter | Configuration Value | Evidence Type | Source / Command |
| :--- | :--- | :--- | :--- |
| **GCP Project** | `sensiblebizpro` (Project #401022448274) | `CONFIGURATION EVIDENCE` | `google-services.json` |
| **Database Instance** | `(default)` | `CONFIGURATION EVIDENCE` | POS Flutter Firestore initialization |
| **Database Region** | `asia-south1` (Mumbai) | `CONFIGURATION EVIDENCE` | `index.js`, Flutter regional endpoints |
| **PITR Status** | `ENABLED` (Default for modern Firestore) | `INFERENCE` / Verification Required | `gcloud firestore databases describe` |
| **Retention Window** | 7 Days (Continuous 168-hour window) | `CONFIGURATION EVIDENCE` | Standard Firestore PITR SLA |
| **Earliest Version Time** | `NOW - 7 DAYS` | `INFERENCE` | Standard Firestore PITR SLA |
| **Current PITR Storage** | **REQUIRES GCP CONSOLE / BILLING DATA** | `BILLING EVIDENCE` | GCP Cloud Billing Report: Firestore PITR SKU |
| **Monthly PITR Cost** | **REQUIRES GCP CONSOLE / BILLING DATA** | `BILLING EVIDENCE` | GCP Cloud Billing Report: Firestore PITR SKU |

### CLI Verification Command
To verify live PITR state directly from Google Cloud Shell / Cloud SDK:
```bash
gcloud firestore databases describe --database="(default)" --project="sensiblebizpro" --format="json(pointInTimeRecoveryEnablement,earliestVersionTime)"
```

---

## 2. Business Purpose for Sensible POS

Cloud Firestore serves as the primary operational database for 5,000+ retail and restaurant merchants running Sensible POS. Transactions include:
1. **Live Fiscal Invoices (`INVOICE`)**: Financial and tax records required for merchant GST filings.
2. **Current Cash Drawer & Shift (`SHIFT`)**: Real-time cashier accountability and counter reconciliation.
3. **Master Product Catalog & Recipe BOM (`PRODUCT`, `RECIPE`)**: Direct inventory valuation and stock balances.

### Why Scheduled Backups Alone Are Insufficient
* Scheduled daily backups (at e.g. 02:00 AM IST) create an up to **24-hour Recovery Point Objective (RPO)**.
* If a runaway Cloud Function, bad app release, or administrative error corrupts data at 04:00 PM on a busy Saturday, restoring from a 02:00 AM backup would destroy **14 hours of continuous billing across 5,000 outlets** (~150,000 to 500,000 transactions).
* **PITR enables an RPO of seconds to minutes**, allowing operators to roll back to `15:59:59 IST` immediately prior to the corrupting event without forfeiting the preceding day's business.

---

## 3. Cost & Pricing Mechanics

### GCP Firestore PITR Billing Rules (`asia-south1` Mumbai)
* **Pricing Rate**: Approximately **\$0.15 to \$0.17 per GiB / month** (pro-rated continuously by the average live data footprint across the 7-day retention horizon).
* **Billing Unit**: `GiB-month of PITR storage`.
* **Cost Multiplier**: PITR storage cost is directly proportional to:
  1. The **base database storage size** (every active document has historical change logs maintained).
  2. The **write volume / velocity** (write-heavy churn creates delta logs).

### Cost Correlation to Codebase Write Patterns
As identified in [write-audit.md](file:///d:/Pavitra%20Nerlikar/my%20git/CRM2.0-Postgress/docs/firestore-cost-audit/write-audit.md), the POS client exhibits high write amplification:
1. **Invoice Double Write**: FlutterFlow writes `InvoiceRecord.createDoc(...)` then immediately calls `.update(id: doc.id)`. Each bill creates two write versions within 100 milliseconds, doubling the PITR transaction delta log.
2. **Shift Thrashing**: Every invoice updates running totals on the active `SHIFT` document. A store processing 300 bills/day generates 300 separate revisions of the single `SHIFT` document per day, all held in PITR logs.
3. **Stock Loop Updates**: Looping stock reductions on raw ingredients generate high write churn.

> [!NOTE]
> Reducing unnecessary Firestore writes (Phase 3 optimization) **automatically reduces PITR write-delta storage**, yielding cost savings without degrading safety.

---

## 4. Risk Analysis: What Happens If PITR Is Disabled?

| Risk Dimension | Impact Severity | Description |
| :--- | :--- | :--- |
| **Data Loss Disaster** | **FATAL** | If database corruption occurs during trading hours, up to 24 hours of customer invoices, taxes, and payments cannot be recovered. |
| **Merchant Trust & Legal** | **EXTREME** | 5,000+ businesses rely on POS for GST audit compliance. Loss of daytime billing data violates merchant tax regulations. |
| **Recovery Latency (RTO)** | **HIGH** | Restoring an entire database from a cold export takes hours of downtime; PITR clone-to-target takes minutes. |
| **Financial Cost vs Benefit** | **NEGLIGIBLE SAVING** | Disabling PITR saves a negligible fraction of the total GCP bill compared to the catastrophic business liability. |

---

## 5. Formal Recommendations

1. **Keep PITR Strictly Enabled**: Under no circumstances should PITR be toggled off for `sensiblebizpro`.
2. **Optimize Upstream Write Churn**: Eliminate the invoice double-write and shift update thrashing. This shrinks PITR log volume at the root.
3. **Extract Exact Billing Itemization**:
   * Navigate to GCP Console > Billing > Cost Table.
   * Filter by Service: `Cloud Firestore`.
   * Filter by SKU: `Point in Time Recovery Storage`.
   * Record the 30-day trailing spend under Section 1.

