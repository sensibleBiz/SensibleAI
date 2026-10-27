# PART 6 — BACKUP FORENSICS
## SENSIBLE POS — FIRESTORE USAGE & COST FORENSIC AUDIT

> **AUDIT STATUS**: READ-ONLY FORENSIC AUDIT  
> **RULE**: DO NOT CHANGE BACKUP RETENTION. DO NOT MODIFY BACKUP CONFIGURATION. DO NOT GUESS.  
> **DATA REQUIREMENT**: REQUIRES GCP CONSOLE / BILLING DATA FOR LIVE RUNTIME METRICS

---

### 1. CODEBASE & REPOSITORY CONFIGURATION AUDIT

Inspection of repository root, `firebase.json`, `.firebaserc`, and Google Cloud Functions confirms:
- **No declarative backup schedules exist in the source repository**.
- Cloud Firestore Scheduled Backups are managed exclusively at the Google Cloud Platform (GCP) control-plane level via the Cloud Console or the `gcloud` CLI.
- No CI/CD scripts or terraform files in this codebase alter backup policies.

---

### 2. CLOUD FIRESTORE BACKUP PRICING & COST ARCHITECTURE

In Google Cloud Platform (Region: `asia-south1`, Mumbai), Firestore Scheduled Backups are billed under the following model:

- **Backup Storage SKU**: `Firestore Scheduled Backup Storage (asia-south1)`
- **Unit Cost**: Approximately **\$0.10 per GiB / month** (₹8.40 / GiB / month at ₹84/\$1).
- **Compounding Growth Driver**:
  Unlike a static database where backup size is constant, each daily backup snapshots the *entire database state* at that timestamp.
  $$\text{Total Monthly Backup Storage} = \text{Database Size at Backup Time} \times \text{Number of Retained Snapshots}$$
  - Example: If the database is 50 GB and backups are retained for 14 weeks (98 daily snapshots):
    $$\text{Backup Storage} = 50\text{ GB} \times 98 = \mathbf{4,900\text{ GB (4.9 TB)}}\implies \mathbf{\$490\text{/month (₹41,160/month)}}.$$
  - If retention is reduced to 7 days (7 daily snapshots):
    $$\text{Backup Storage} = 50\text{ GB} \times 7 = \mathbf{350\text{ GB}}\implies \mathbf{\$35\text{/month (₹2,940/month)}}.$$
  - **Estimated Saving**: $\approx \mathbf{93\%\text{ reduction in backup storage charges}}.$

---

### 3. BACKUP RETENTION COMPARISON MATRIX

> [!IMPORTANT]
> The exact numeric values below require extraction from the GCP Billing Console and `gcloud firestore backups` CLI. The structure below is pre-formatted for executive documentation upon console verification.

#### Current vs. Optimized Backup Model:

```text
BEFORE (Historical Baseline Configuration)
Retention Period:               REQUIRES GCP CONSOLE / BILLING DATA (e.g. 14 weeks / 90 days)
Daily Snapshots Retained:       REQUIRES GCP CONSOLE / BILLING DATA
Backup Storage Consumed:        REQUIRES GCP CONSOLE / BILLING DATA (in GiB)
Monthly Cost:                   REQUIRES GCP CONSOLE / BILLING DATA (₹ / month)

AFTER (Recommended Standard Operational Retention)
Recommended Retention:          7 Days (Daily Snapshots) + 4 Weeks (Weekly Snapshots)
Projected Backup Storage:       REQUIRES GCP CONSOLE / BILLING DATA (in GiB)
Projected Monthly Cost:         REQUIRES GCP CONSOLE / BILLING DATA (₹ / month)

EXPECTED SAVING:
₹ / month:                      REQUIRES GCP CONSOLE / BILLING DATA
Percentage:                     Estimated 70% – 90% reduction in backup storage SKU

ACTUAL SAVING (Post-implementation Measurement):
₹ / month:                      REQUIRES GCP CONSOLE / BILLING DATA
```

---

### 4. LIVE GCP VERIFICATION PROCEDURES (FOR GCP ADMINISTRATOR)

To obtain the exact production backup metrics without modifying configuration, run the following read-only commands in the Google Cloud SDK authenticated to project `sensiblebizpro`:

```bash
# 1. Inspect existing backup schedules for the default POS database:
gcloud firestore backups schedules list --database='(default)' --project=sensiblebizpro

# 2. List all current retained backups and their creation timestamps:
gcloud firestore backups list --format="table(name,database,createTime,expireTime)" --project=sensiblebizpro

# 3. Check exact billed backup storage in GCP Cloud Monitoring:
# Metric: firestore.googleapis.com/backup/storage/bytes
```

---

### 5. RECOMMENDATIONS & SAFETY BOUNDARIES

1. **Do NOT Disable Backups**:
   - Backups are critical disaster recovery assets protecting 5,000+ businesses from catastrophic loss or corruption.
2. **Review Retention Window**:
   - Aligning daily retention to 7 days and weekly retention to 4 weeks provides full operational disaster recovery while eliminating months of stale compounding snapshot storage.
3. **Formal Approval Required**:
   - Any retention adjustment must be formally approved by engineering leadership after confirming compliance requirements.

