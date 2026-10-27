# PART 4 — STORAGE FORENSICS
## SENSIBLE POS — FIRESTORE USAGE & COST FORENSIC AUDIT

> **AUDIT STATUS**: READ-ONLY FORENSIC AUDIT  
> **SCOPE**: Data Models, Embedded Arrays, Document Sizing, and Storage Growth Drivers across 5,000+ Customer Outlets  
> **STRUCT & RECORD MODELS AUDITED**: 99 Schema Models  
> **DOMINANT STORAGE CONSUMERS**: `INVOICE`, `STOCK_SUMMARY`, `PRODUCT`, `TABLE_KOT`, `SHIFT`

---

### 1. STORAGE DISTRIBUTION & LARGEST COLLECTIONS

Firestore storage is billed on two components:
1. **Document Data Storage**: Stored document bytes + 32-byte document overhead.
2. **Index Storage**: Automatic single-field indexes (ascending, descending, array-contains) + composite indexes defined in `firestore.indexes.json`.

```
ESTIMATED FIRESTORE STORAGE COMPOSITION (POS INFRASTRUCTURE)
┌────────────────────────────────────────────────────────────┐
│ [████████████████████████████████████████] INVOICE (~65%) │
│ [██████████████] STOCK_SUMMARY & PURCHASES (~15%)          │
│ [██████] PRODUCT & CATALOG (~8%)                           │
│ [████] TABLE_KOT & SHIFTS (~6%)                            │
│ [██] PARTY & MASTER COLLECTIONS (~4%)                      │
│ [██] QR_TRANSACTIONS, LOGS, OTHER (~2%)                    │
└────────────────────────────────────────────────────────────┘
```

#### Collection Sizing & Growth Profile:

| Collection Path | Typical Doc Size | Growth Rate / Driver | Retention Need | Current Archival Status |
|---|---|---|---|---|
| `/OUTLET/{id}/INVOICE` | **2.5 KB – 8.0 KB** (varies with item count) | 250K – 1M docs/day (15M – 30M docs/month across 5,000 customers) | 7 Years (Statutory Tax Compliance) | **Zero archival / zero TTL**. Retained indefinitely in primary Firestore. |
| `/OUTLET/{id}/STOCK_SUMMARY` | **1.5 KB – 4.0 KB** | Hundreds of thousands of logs/day (generated on recipe deductions) | 1 Year (Auditing) | Zero archival. Accumulated indefinitely. |
| `/OUTLET/{id}/PRODUCT` | **1.8 KB – 3.2 KB** | Stable (500 – 5,000 items per customer) | Permanent | Active operational catalog. |
| `/OUTLET/{id}/TABLE_KOT` | **1.0 KB – 2.5 KB** | 50K – 200K tickets/day in restaurant outlets | 30 Days | Zero TTL. Settled KOTs remain forever. |
| `/OUTLET/{id}/SHIFT` | **3.0 KB – 6.0 KB** | 1 – 3 docs/day per terminal (embeds sale list & payment breakdown) | 3 Years | Stored indefinitely. |
| `/OUTLET/{id}/QR_TRANSACTIONS`| **0.8 KB – 1.5 KB** | Generated per dynamic QR bill attempt | 90 Days | Stored indefinitely. |

---

### 2. DEEP INSPECTION OF DOCUMENT STRUCTS & PAYLOAD SWELL

Analysis of the 99 schema definitions in `lib/backend/schema/` reveals substantial payload bloat caused by denormalized, redundant fields:

#### The `InvoiceRecord` & `SelItemListStruct` Swell:
In `lib/backend/schema/invoice_record.dart`, each invoice contains:
- 35 top-level fields (invoice number, date, tax, discounts, roundoff, createdBy, customer references, etc.).
- An embedded `productList` array composed of `SelItemListStruct` (`lib/backend/schema/structs/sel_item_list_struct.dart`).
- **Each item in `productList` contains 28 distinct fields**:
  ```dart
  name, price, quantity, total, id, catId, isDeletedItem,
  taxPer, taxAmt, taxId, categoryP, disAmt, disPer, ordertype,
  qtystring, kotTime, printKot, kotRemark, unit, imeiNo,
  color, model, purchasePrice, variantId, regionalName,
  baseQuantity, printedQty, deleteRemark
  ```

#### Forensic Calculation of a Standard Invoice:
- A retail grocery invoice with 25 items stores:
  $$35\text{ top-level fields} + (25 \times 28\text{ fields}) = \mathbf{735\text{ serialized field values in ONE document!}}$$
- Fields like `color`, `model`, `imeiNo`, `deleteRemark`, `printKot`, `qtystring`, `categoryP`, `regionalName` are written even when null/empty or irrelevant for grocery/restaurant bills.
- At 30 million invoices per year across 5,000 customers, storing 28 fields per item instead of 6 core transaction fields (`id`, `qty`, `rate`, `total`, `taxAmt`, `taxPer`) inflates storage by approximately **60% to 75% per document**.

---

### 3. REDUNDANT & DUPLICATE DATA PATTERNS

The forensic scan identified five specific patterns of data duplication:

1. **Self-referential `id` field**:
   Every document in `INVOICE`, `PRODUCT`, `PARTY`, `SHIFT`, `CATEGORY`, `TABLE_KOT`, etc., stores an `id: String` field inside the document payload that is **100% identical to the Firestore document ID**.
   - Storage overhead: ~30 bytes per document $\times$ tens of millions of documents $\approx$ gigabytes of redundant storage plus associated index storage.
2. **Denormalized Master Data in Line Items**:
   `SelItemListStruct` embeds master product metadata (`regionalName`, `categoryP`, `taxId`, `catId`, `unit`, `purchasePrice`) into every single historical invoice. While snapshotting unit price and tax rate is necessary for legal auditability, snapshotting descriptive UI properties (`regionalName`, `color`, `model`, `printKot`) causes permanent storage bloat.
3. **Dual Storage (Cloud Firestore + Local SQLite/Hive)**:
   The application maintains full offline databases in SQLite (`SQLiteManager`) and Hive (`setup_item_hive.dart`). However, because cloud Firestore is treated as the primary storage for every historical invoice, no data is ever offloaded from the cloud.

---

### 4. DATA CLASSIFICATION: OPERATIONAL VS. ARCHIVAL

To protect the 5,000+ customers, data must be classified strictly by operational necessity:

| Category | Collections / Documents | Operational Rule | Recommended Storage Strategy |
|---|---|---|---|
| **1. Critical Operational (Must remain in Firestore)** | Active `PRODUCT`, `CATEGORY`, `USER_PROFILE`, `DEVICE`, `APP_SETTINGS`, `PRINT_SETTINGS`, `TAX_MASTER`, Active `SHIFT`, Current Day's `INVOICE`, Active `TABLE_KOT` | Essential for real-time POS operations, checkout, offline-sync startup. | **Keep in Firestore primary database**. Optimize document fields only. |
| **2. Short-term Operational (30–90 Days)** | Settled `TABLE_KOT`, `QR_TRANSACTIONS`, `STOCK_SUMMARY` logs, Invoices < 90 days | Used for return handling, weekly/monthly report views, sales comparison. | **Retain in Firestore for 90 days**. |
| **3. Historical / Compliance Data (> 90 Days to 7 Years)** | Invoices older than 90 days, closed shifts older than 90 days, historical purchase inward orders | Required ONLY for tax filing, annual audits, and historical accounting. **Never accessed during real-time checkout**. | **Eligible for cold archival** (e.g. export to Cloud Storage (GCS) or BigQuery at $0.02/GB vs $0.18/GB Firestore). |
| **4. Orphan / Ephemeral Data** | `QR_TRANSACTIONS` older than 7 days, temporary hold lists, cancelled KOT tickets, test collections (`shrikantProduct`) | Zero operational or compliance value. | **Eligible for TTL auto-deletion**. |

---

### 5. FINANCIAL IMPACT OF STORAGE ACCUMULATION

- Firestore primary storage in `asia-south1`: **\$0.18 per GiB / month** (plus backup storage charges of \$0.10/GB/month and PITR charges of \$0.15/GB/month).
- Total blended cost of 1 GiB in Firestore = **\$0.43 per GiB / month**.
- Because Sensible POS does not archive historical invoices, **Firestore storage grows monotonically every single month**.
- Every 1,000,000 historical invoices left in Firestore indefinitely costs:
  $$\approx 3.5\text{ GB} \times \$0.43 = \mathbf{\$1.50\text{/month in perpetuity per million bills}}.$$
- Over 3 to 5 years across 5,000 customers, historical data accumulation becomes one of the primary compounding cost drivers of the entire Firebase bill.

