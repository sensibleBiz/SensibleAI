# PART 1 — FIRESTORE DATABASE INVENTORY
## SENSIBLE POS — FIRESTORE USAGE & COST FORENSIC AUDIT

> **AUDIT STATUS**: READ-ONLY FORENSIC AUDIT  
> **TARGET SYSTEM**: Sensible POS Production Infrastructure (5,000+ Customers)  
> **DATA EVIDENCE SOURCES**:
> 1. Codebase: `D:\Pavitra Nerlikar\sensible_biz_p_o_s` (Flutter Multiplatform POS Client & Firebase Cloud Functions)
> 2. Configuration: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `android/app/google-services.json`
> 3. Production Profiling Telemetry: `backend/artifacts/firestore-profile/firestore-profile-summary.md` (sensiblecrm baseline)
> 4. Verification Date: 2026-10-07

---

### 1. FIREBASE PROJECTS & TOPOLOGY

| Property | Value | Evidence Source |
|---|---|---|
| **Primary POS Firebase Project** | `sensiblebizpro` | `google-services.json`, `lib/backend/firebase/firebase_config.dart` |
| **Project Number** | `401022448274` | `google-services.json` |
| **Storage Bucket** | `sensiblebizpro.appspot.com` | `google-services.json`, `firebase_config.dart` |
| **Hosting Target** | `sensiblebizpro` (`pro-crm`) | `.firebaserc` |
| **Cloud Functions Region** | `asia-south1` (Mumbai) & `us-central1` | `api_calls.dart`, `firebase/functions/index.js` |
| **Auxiliary/Legacy Project** | `sensiblecrm` (Project #700529442570) | `.firebaserc`, `export-outlet-data.mjs` |
| **External Messaging/PDF Project** | `sconnect-pos` (`asia-south1-sconnect-pos`) | `lib/backend/api_requests/api_calls.dart:462, 502` |

#### Client Applications Bound to `sensiblebizpro`:
The Google Services configuration registers 12 client packages operating against the production project:
1. `com.sensible.pos` (Main Android POS terminal app)
2. `com.sensibleconnect.sensiblebizpos` (Sensible Biz POS)
3. `com.sensibleconnect.sensiblebizpro` (Sensible Biz Pro Mobile/Desktop)
4. `com.sensible.bizpro` (Biz Pro alternative package)
5. `com.sensible.admin` (Admin management app)
6. `com.sensibleconnect.adminpanelpos` (POS Admin Panel)
7. `com.mycompany.adminpanelnsiblepos` (Legacy FlutterFlow admin)
8. `com.sensible.sendesk2.O` (SenDesk customer support)
9. `com.sensibleconnect.parkingapp` (Parking management POS)
10. `com.mycompany.desktopdemo` (Windows desktop terminal)
11. `com.mycompany.multipledb` (Multi-database test harness)
12. `com.mycompany.demoforfirestore` (Firestore client demo)

---

### 2. FIRESTORE DATABASE ARCHITECTURE & HIERARCHY

The Sensible POS system uses a multi-tenant hierarchy partitioned under the `/OUTLET/{outletId}/` path, combined with top-level shared master reference collections.

```
cloud.firestore (default database, region: asia-south1 [Mumbai])
├── ROOT COLLECTIONS (Master Configuration & Tenant Identity)
│   ├── OUTLET (Tenant root doc per customer outlet)
│   ├── BUSINESSS_MASTER (Enterprise business entity)
│   ├── BUSINESS_TYPE (Industry classification)
│   ├── USER_PROFILE (Operators, cashiers, admins, roles, quick pins)
│   ├── DEVICE (Physical POS hardware registry, MAC/device IDs)
│   ├── TAX_MASTER (GST slabs, tax rates, tax definitions)
│   ├── UNIT_TYPE (Measurement units: KG, PCS, LTR, etc.)
│   ├── CATEGORY_MASTER (Global master categories)
│   ├── PRODUCT_MASTER (Global master product templates)
│   ├── SERVICE_POINT (Kitchen/counter routing targets)
│   ├── SUB_CATEGORY (Global sub-categories)
│   ├── LANGUAGE (Language definitions)
│   ├── PAYMENT_MODE (Cash, UPI, Card, Credit, etc.)
│   ├── USER_ROLE_TYPE / USER_ROLL_TYPE (Permission roles)
│   ├── SUBSCRIPTION (License/billing tier status)
│   ├── COMPANY_DETAILS (Legal info, terms, privacy)
│   ├── APP_SETTINGS_MASTER (Global hardware/printer defaults)
│   ├── ONLINE_ORDERS (Online ordering ingest)
│   ├── COUNTRIES (Geographic master)
│   └── VERSION_CONTROL (App release management)
│
└── OUTLET SUBCOLLECTIONS (/OUTLET/{outletId}/...)
    ├── INVOICE (Operational bill records, customer transactions)
    ├── PRODUCT (Outlet-specific items, prices, barcodes, currentStock)
    ├── CATEGORY (Outlet-specific item categories)
    ├── SHIFT (Active and historical cashier register shifts)
    ├── PARTY (Customer CRM list, phone, address, credit balances)
    ├── APP_SETTINGS (Device-level POS hardware/behavior configuration)
    ├── PRINT_SETTINGS (Thermal receipt printer configurations)
    ├── PAYMENT (Payment ledger entries)
    ├── PURCHASE (Vendor inward purchase receipts)
    ├── STOCK_SUMMARY (Stock movement logs: IN/OUT/TRANSFER)
    ├── TABLE_KOT (Kitchen Order Tickets for restaurant mode)
    ├── TABLE_JSON (Live restaurant floor layout and table states)
    ├── PREMISES (Outlet dining areas, floor sections)
    ├── SERVICE_POINT_OUTLET (Assigned KOT printers per floor)
    ├── RECIPE (BOM / item recipe ingredient mappings)
    ├── VARIANT (Product item variants: sizes, flavors)
    ├── VARIANT_GROUP (Variant grouping containers)
    ├── UPI_CONFIGURATION_QRCODE (Dynamic QR code merchant parameters)
    ├── BATCH (Inventory batch numbers and expiry tracking)
    ├── VEHICLE (Delivery / parking vehicle tracking)
    ├── HEADER / FOOTER (Receipt header/footer text)
    ├── ADVERTISEMENT (Customer display ad banners)
    ├── QR_TRANSACTIONS (Dynamic payment QR transaction states)
    ├── MONTHLY_PASS (Subscription/parking pass records)
    └── COUPONS_CODE (Discount promo vouchers)
```

---

### 3. COMPREHENSIVE COLLECTION INVENTORY & ANALYSIS TABLE

| Collection Path | Purpose in POS | Document Structure & Field Count | Read Activity | Write Activity | Importance to POS | Retention Requirement | Potential Safe Optimization |
|---|---|---|---|---|---|---|---|
| `/OUTLET/{id}/INVOICE` | Core sales transaction records; store bill items, totals, payment modes | 35 top-level fields + embedded `productList` array of 28-field structs (`SelItemListStruct`) | High (38 direct query points + collectionGroup) | Very High (2 writes per bill: `.set()` + immediate `.update()`) | **Critical (P0)** | 7 Years (Statutory Tax Compliance) | 1. Remove redundant `.update(id: id)`. 2. Archive invoices > 90 days to cold storage. 3. Strip redundant fields from `productList`. |
| `/OUTLET/{id}/PRODUCT` | Catalog of saleable items, barcodes, prices, live stock count | 54 fields per document; includes pricing, categories, tax links, stockable flags | Very High (45 query points + unpaginated loading dumps in `addFirebasetoSql`) | Moderate (Product edits, stock adjustments, recipe deductions) | **Critical (P0)** | Permanent (Operational) | 1. Replace unpaginated `.get()` with delta sync (`updatedAt > lastSync`). 2. Serve from SQLite after initial load. |
| `/OUTLET/{id}/SHIFT` | Register shift drawer, opening cash, closing cash, sales summary | 29 fields per document; embeds `productSaleList`, `paymentJson` | High (47 query points; queried on every bill finalization) | High (Written and updated on every single printed bill) | **Critical (P0)** | 3 Years (Auditing) | 1. Stop querying shift doc on every bill. 2. Accumulate shift totals locally in SQLite/Hive and push on shift close. |
| `/OUTLET/{id}/PARTY` | Customer registry, phone number, address, credit ledger | 35 fields per document (`name`, `mobile`, `creditLimit`, `balance`) | High (37 query points, active realtime StreamBuilder) | Low/Moderate (New customer creation, balance updates) | **Critical (P1)** | Permanent (Customer data) | 1. Remove realtime StreamBuilder on entire list during billing. 2. Query on demand by mobile index with `limit(1)`. |
| `/OUTLET/{id}/CATEGORY` | Product groupings for POS grid UI | 15 fields (`categoryNo`, `name`, `code`, `isDeleted`, `regionalName`) | High (25 query points) | Low (Occasional admin updates) | **Critical (P1)** | Permanent (Master data) | Cache locally in SQLite/Hive; read only on sync or change notification. |
| `/OUTLET/{id}/APP_SETTINGS` | Per-terminal hardware settings, display config, receipt toggles | 32 fields; embeds `settingList` JSON array | Very High (57 query points; fetched in GoRouter navigation) | Very Low (Admin setup) | **Critical (P0)** | Permanent | Cache in local device storage (`SharedPreferences` / SQLite). Strip from GoRouter `asyncParams`. |
| `/OUTLET/{id}/PRINT_SETTINGS` | Thermal printer setup, IP, Bluetooth MAC, ESC/POS commands | 33 fields (`ip`, `port`, `bluetoothAddress`, `paperSize`) | Moderate (5 query points) | Very Low | **Critical (P0)** | Permanent | Cache permanently in local app state / SQLite. |
| `/OUTLET/{id}/TABLE_KOT` | Restaurant Kitchen Order Tickets | 28 fields (`tableNo`, `kotStatus`, `items`, `kotTime`) | Moderate (9 query points; composite indexed) | High (KOT generate, punch, settle) | **High (P1)** | 30 Days (Daily operations) | Auto-delete or TTL archive settled KOTs after shift completion. |
| `/OUTLET/{id}/TABLE_JSON` | Floor layout and live table occupancy state | 12 fields; stores full floor layout JSON map | High (9 query points; realtime StreamBuilder) | Moderate (Table transfer, seat, unseat) | **High (P1)** | Ephemeral / Active shift | Migrate live layout sync to local WebSocket / LAN (Captain App server) instead of cloud Firestore. |
| `/OUTLET/{id}/STOCK_SUMMARY` | Historical stock movement logs | 18 fields; embeds `productListMap` array | Moderate (8 query points; collectionGroup indexed) | High (Generated on EVERY bill if recipes are used) | **Medium (P2)** | 1 Year | 1. Stop generating a document per bill. 2. Batch stock-out logs per shift or daily close. |
| `/OUTLET/{id}/PREMISES` | Restaurant floor areas (AC, Non-AC, Garden, Bar) | 14 fields (`name`, `charge`, `printerIp`) | Moderate (11 query points) | Very Low | **Medium (P2)** | Permanent | Cache locally in SQLite. |
| `/OUTLET/{id}/RECIPE` | Bill-of-Materials (BOM) ingredient breakdown per product | 16 fields; embeds `items` array | Moderate (10 query points) | Low | **High (P1)** | Permanent | Cache in SQLite. Use local deduction during checkout. |
| `/OUTLET/{id}/VARIANT` & `VARIANT_GROUP` | Product attributes (Size, Toppings, Colors) | 22 fields per variant | Moderate (8 query points) | Low | **High (P1)** | Permanent | Cache in SQLite alongside products. |
| `/OUTLET/{id}/UPI_CONFIGURATION_QRCODE` | Dynamic QR code merchant VPA configuration | 10 fields (`payName`, `upiId`, `outletId`) | Moderate (4 query points) | Very Low | **Critical (P0)** | Permanent | Cache in app state; read once on startup. |
| `/OUTLET/{id}/PURCHASE` | Inventory inward stock entries from distributors | 44 fields; embeds line items | Moderate (20 query points) | Low (Inward stock creation) | **High (P1)** | 7 Years (Statutory) | Archive inward receipts > 1 year. |
| `/OUTLET/{id}/BATCH` | Pharmaceutical / perishable lot numbers and expiration dates | 14 fields (`batchName`, `startDateTime`, `endDateTime`, `code`) | Moderate (9 query points; composite indexed) | Low | **High (P1)** | Product Life + 1 Year | Archive expired batches. |
| `/OUTLET/{id}/QR_TRANSACTIONS` | PhonePe / UPI dynamic QR payment status polling | 16 fields (`orderId`, `status`, `amount`, `transactionId`) | Moderate (14 query points; collectionGroup indexed) | High (Per dynamic UPI bill) | **Critical (P0)** | 1 Year | Delete temporary polling tokens after payment success / expiry. |
| `USER_PROFILE` (Root) | Cashier / Operator accounts, Quick PIN, mobile, permissions | 31 fields (`quickPin`, `empCode`, `display_name`, `outlets`) | High (25 query points; queried on login screen) | Low (Admin user management) | **Critical (P0)** | Permanent (IAM) | Restrict read to authenticated outlet context. Do not stream full collection on login. |
| `DEVICE` (Root) | Physical POS device registry, hardware MAC, license activation | 32 fields (`deviceId`, `platform`, `outletId`, `licenseKey`) | High (17 query points) | Low (Device registration, heartbeat) | **Critical (P0)** | Permanent | Cache device document ID locally; query by document ID rather than full collection query. |
| `TAX_MASTER` (Root) | Indian GST tax slabs (0%, 5%, 12%, 18%, 28%) | 12 fields (`name`, `percentage`, `code`) | Extreme (41 direct queries + 29 screen GoRouter `asyncParams`) | Near Zero (Annual/Statutory updates) | **Critical (P0)** | Permanent | **High Priority Optimization**: Cache permanently in SQLite. Remove from all 29 screen `asyncParams`. |
| `UNIT_TYPE` (Root) | Master measurement units | 12 fields (`unitType`, `code`, `factor`) | High (21 query points) | Near Zero | **Critical (P1)** | Permanent | Cache in SQLite; remove redundant queries. |
| `PAYMENT_MODE` (Root) | Cash, Card, UPI, Wallet, Credit, Cheque | 10 fields (`name`, `code`, `isActive`) | High (19 query points + GoRouter `asyncParams`) | Near Zero | **Critical (P1)** | Permanent | Cache in SQLite; remove from GoRouter `asyncParams`. |
| `VERSION_CONTROL` (Root) | POS app APK / EXE release version, force-update flags | 10 fields (`versionCode`, `isVersionLive`, `stage`) | Moderate (6 query points; composite indexed) | Near Zero | **Medium (P2)** | Current version only | Query single document once on app bootstrap. |
| `shrikantProduct` (Root) | Test / ad-hoc collection in production | Unstructured | Low (4 query points) | Zero | **None (P4)** | Candidate for Cleanup | Audit whether active code references it; quarantine if unused. |

---

### 4. SUMMARY OF INVENTORY FINDINGS

1. **Volume Concentration**:
   - The greatest document count and storage volume in Sensible POS is concentrated in **`INVOICE`**, **`STOCK_SUMMARY`**, **`TABLE_KOT`**, and **`PRODUCT`**.
   - With 5,000+ active customers generating an average of 50–200 bills daily, `INVOICE` accumulates between **250,000 and 1,000,000 documents per day** (7.5M to 30M documents per month across all tenants).
2. **TTL & Lifecycle Policies**:
   - **Zero TTL (Time-To-Live) policies** are configured anywhere in `firebase.json` or `firestore.indexes.json`.
   - Ephemeral operational records (`TABLE_KOT`, `QR_TRANSACTIONS`, expired `BATCH`, and `STOCK_SUMMARY` logs) are never automatically deleted or aged out.
3. **Write Amplification**:
   - `INVOICE` is subjected to two distinct network write operations for every transaction due to FlutterFlow post-creation document ID patches.
4. **Master Data Read Pollution**:
   - Static reference collections (`TAX_MASTER`, `UNIT_TYPE`, `PAYMENT_MODE`, `APP_SETTINGS`) are continually re-read over the network across 41 GoRouter navigation transitions instead of being read once and held in local memory or SQLite.

