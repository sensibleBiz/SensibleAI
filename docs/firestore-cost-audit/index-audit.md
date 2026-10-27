# PART 5 — FIRESTORE INDEX FORENSICS
## SENSIBLE POS — FIRESTORE USAGE & COST FORENSIC AUDIT

> **AUDIT STATUS**: READ-ONLY FORENSIC AUDIT  
> **RULE**: DO NOT REMOVE OR CHANGE INDEXES. IDENTIFY CANDIDATES FOR REVIEW ONLY.  
> **CONFIGURATION FILE**: `firebase/firestore.indexes.json` in `sensible_biz_p_o_s`  
> **INDEX COUNT**: 15 Composite Indexes + 2 Collection Group Field Overrides

---

### 1. INDEX INVENTORY & CODE QUERY CORRELATION

Every composite index defined in `firebase/firestore.indexes.json` was correlated against query call sites in the Dart codebase:

| # | Collection Group | Indexed Fields & Order | Query Scope | Code Query Found in Codebase | Dependent Feature / Screen | Status / Review Notes |
|---|---|---|---|---|---|---|
| **1** | `INVOICE` | `dayId` (ASC), `isDeleted` (ASC), `count` (ASC) | COLLECTION | `where('dayId', ...).where('isDeleted', ...).orderBy('count')` | Daily bill sequence lookup, bill count audit | **Active / Required** |
| **2** | `INVOICE` | `isDeleted` (ASC), `invoiceDate` (DESC) | COLLECTION | `where('isDeleted', false).orderBy('invoiceDate', descending: true)` | Main sales history, recent bills screen | **Active / Required** |
| **3** | `INVOICE` | `tableId` (ASC), `invoiceDate` (ASC) | COLLECTION | `where('tableId', ...).orderBy('invoiceDate')` | Restaurant table bill history / KOT settle | **Active / Required** |
| **4** | `INVOICE` | `dayId` (ASC), `invoiceDate` (ASC) | COLLECTION | `where('dayId', ...).orderBy('invoiceDate')` | Daily sales chronological audit | **Potential Overlap** (Can be served by Index #14 if `isDeleted` is included) |
| **5** | `INVOICE` | `dayId` (ASC), `isDeleted` (ASC), `count` (DESC) | COLLECTION | `where('dayId', ...).where('isDeleted', ...).orderBy('count', descending: true)` | Finding last bill number for the day | **Active / Required** |
| **6** | `INVOICE` | `source` (ASC), `invoiceDate` (DESC) | COLLECTION | `where('source', ...).orderBy('invoiceDate', descending: true)` | Online orders / Zomato / Swiggy / counter split | **Active / Required** |
| **7** | `INVOICE` | `isDeleted` (ASC), `dayId` (ASC), `invoiceDate` (DESC) | COLLECTION | `where('isDeleted', false).where('dayId', ...).orderBy('invoiceDate', descending: true)` | Daily reports, day sales summary | **Active / Required** |
| **8** | `PRODUCT` | `isDeleted` (ASC), `stockable` (ASC), `name` (ASC) | COLLECTION | `where('isDeleted', false).where('stockable', true).orderBy('name')` | Product catalog grid sorted alphabetically | **Active / Required** |
| **9** | `PRODUCT` | `stockable` (ASC), `name` (DESC) | COLLECTION | `where('stockable', ...).orderBy('name', descending: true)` | Inverted stockable sort | **Review Candidate** (Infrequently used in POS UI) |
| **10** | `CATEGORY` | `isDeleted` (ASC), `categoryNo` (ASC) | COLLECTION | `where('isDeleted', false).orderBy('categoryNo')` | Category carousel sorted by display order | **Active / Required** |
| **11** | `TABLE_KOT`| `tableNo` (ASC), `kotStatus` (ASC) | COLLECTION | `where('tableNo', ...).where('kotStatus', ...)` | Live table KOT active tickets | **Active / Required** |
| **12** | `DEVICE` | `deviceId` (ASC), `createdDate` (ASC) | COLLECTION | `where('deviceId', ...).orderBy('createdDate')` | Device registration verification | **Active / Required** |
| **13** | `PAYMENT` | `partyId` (ASC), `createdDate` (ASC) | COLLECTION | `where('partyId', ...).orderBy('createdDate')` | Customer payment history / ledger | **Active / Required** |
| **14** | `BATCH` | `endDateTime` (ASC), `code` (DESC) | COLLECTION | `where('endDateTime', ...).orderBy('code', descending: true)` | Expiry date sorting for pharmaceutical lots | **Active / Required** |
| **15** | `VERSION_CONTROL` | `isVersionLive` (ASC), `stage` (ASC), `versionCode` (DESC) | COLLECTION | `where('isVersionLive', true).where('stage', ...).orderBy('versionCode', descending: true)` | Force app upgrade check on launch | **Active / Required** |

---

### 2. COLLECTION GROUP FIELD OVERRIDES

| Collection Group | Field Path | Overridden Index | Query Scope | Purpose |
|---|---|---|---|---|
| `QR_TRANSACTIONS` | `orderId` | ASCENDING | COLLECTION_GROUP | Allows cross-outlet lookup of a PhonePe/UPI transaction by order ID across all tenants. |
| `STOCK_SUMMARY` | `createdAt` | DESCENDING | COLLECTION_GROUP | Allows cross-outlet audit querying of stock movement logs by date. |

---

### 3. INDEX STORAGE & WRITE AMPLIFICATION ANALYSIS

1. **Default Single-Field Index Overhead**:
   - Firestore automatically indexes **EVERY field in EVERY document** twice (Ascending and Descending), plus Array-Contains for arrays, unless explicitly disabled with an index exemption.
   - For `InvoiceRecord` (35 fields):
     $$35\text{ fields} \times 2 = \mathbf{70\text{ automatic single-field index entries per document}}.$$
   - For `SelItemListStruct` in `productList` (an array of maps): Firestore creates array index entries.
   - Plus the **7 composite indexes** that match invoice fields.
2. **Write Amplification Phenomenon**:
   - Every single time an invoice is written (`set()` or `update()`), Firestore must update **between 75 and 85 index entries** in the internal index table!
   - Because Sensible POS performs **two writes per invoice** (`.set()` followed by `.update(id: id)`), the system executes **~150 internal index updates per bill**!
3. **Index Storage Cost**:
   - Index storage is billed at the exact same rate as document data storage (\$0.18/GiB/month in `asia-south1`).
   - For collections with 30+ fields like `INVOICE`, index storage frequently equals or exceeds 50% to 100% of raw document data storage.
4. **Candidates for Future Review (Do Not Remove Without Approval)**:
   - Index #4 (`INVOICE`: `dayId` + `invoiceDate` ASC): Investigate whether application code can adopt Index #7 (`isDeleted` + `dayId` + `invoiceDate` DESC) by standardizing query ordering.
   - Index #9 (`PRODUCT`: `stockable` + `name` DESC): Verify if reverse alphabetical sort is ever displayed in production POS UI.
   - Single-field index exemptions: Fields that are never queried with inequality or range filters (e.g. `disRemark`, `products`, `weight`, `kotStatus` in `INVOICE`) can have single-field indexing disabled to reduce write amplification and index storage.

