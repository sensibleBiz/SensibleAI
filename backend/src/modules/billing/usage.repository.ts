import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { UsageEventRecord, UsageEventStatus } from "./usage.types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Row type (snake_case from PostgreSQL)
// ─────────────────────────────────────────────────────────────────────────────

interface UsageEventRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  outlet_id: string;
  wallet_id: string;
  service_type: string;
  quantity: string;
  unit_label: string;
  rate_card_id: string | null;
  estimated_credits: string | null;
  billed_credits: string | null;
  status: UsageEventStatus;
  wallet_txn_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string;
  actor_user_id: string | null;
  provider_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const USAGE_EVENT_COLUMNS = `
  id, tenant_id, outlet_id, wallet_id, service_type, quantity, unit_label,
  rate_card_id, estimated_credits, billed_credits, status, wallet_txn_id,
  reference_type, reference_id, idempotency_key, actor_user_id, provider_ref,
  metadata, created_at, updated_at
`;

const mapUsageEvent = (row: UsageEventRow): UsageEventRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  outletId: row.outlet_id,
  walletId: row.wallet_id,
  serviceType: row.service_type,
  quantity: row.quantity,
  unitLabel: row.unit_label,
  rateCardId: row.rate_card_id,
  estimatedCredits: row.estimated_credits,
  billedCredits: row.billed_credits,
  status: row.status,
  walletTxnId: row.wallet_txn_id,
  referenceType: row.reference_type,
  referenceId: row.reference_id,
  idempotencyKey: row.idempotency_key,
  actorUserId: row.actor_user_id,
  providerRef: row.provider_ref,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ─────────────────────────────────────────────────────────────────────────────
// Usage event repository — INSERT + UPDATE only (no DELETE by design)
// ─────────────────────────────────────────────────────────────────────────────

export const usageRepository = {

  // Insert a PENDING usage event.
  // ON CONFLICT (tenant_id, idempotency_key) DO NOTHING → idempotent;
  // returns { event, inserted: false } when the key already exists.
  async insertPending(
    db: TransactionDatabase,
    input: {
      tenantId: string;
      outletId: string;
      walletId: string;
      serviceType: string;
      quantity: string;
      unitLabel: string;
      rateCardId: string;
      estimatedCredits: string;
      idempotencyKey: string;
      actorUserId: string | null;
      referenceType: string | null;
      referenceId: string | null;
      providerRef: string | null;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ event: UsageEventRecord; inserted: boolean }> {
    const insertResult = await db.client.query<UsageEventRow>(`
      INSERT INTO billing.usage_events (
        tenant_id, outlet_id, wallet_id, service_type, quantity, unit_label,
        rate_card_id, estimated_credits, status, idempotency_key,
        actor_user_id, reference_type, reference_id, provider_ref, metadata
      ) VALUES (
        $1, $2, $3, $4, $5::numeric, $6, $7::uuid, $8::numeric, 'PENDING', $9,
        $10::uuid, $11, $12::uuid, $13, $14::jsonb
      )
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING ${USAGE_EVENT_COLUMNS}
    `, [
      input.tenantId, input.outletId, input.walletId,
      input.serviceType, input.quantity, input.unitLabel,
      input.rateCardId, input.estimatedCredits,
      input.idempotencyKey,
      input.actorUserId ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.providerRef ?? null,
      JSON.stringify(input.metadata),
    ]);

    if (insertResult.rows[0]) {
      return { event: mapUsageEvent(insertResult.rows[0]), inserted: true };
    }

    // Conflict: key already exists — fetch the existing row
    const existing = await db.client.query<UsageEventRow>(`
      SELECT ${USAGE_EVENT_COLUMNS}
      FROM billing.usage_events
      WHERE tenant_id = $1 AND idempotency_key = $2
    `, [input.tenantId, input.idempotencyKey]);

    if (!existing.rows[0]) {
      throw new Error(`Usage event idempotency conflict but row not found: key=${input.idempotencyKey}`);
    }
    return { event: mapUsageEvent(existing.rows[0]), inserted: false };
  },

  // Transition a PENDING usage event to BILLED.
  // Also records the wallet_txn_id so the coherence constraint is satisfied.
  // Only updates rows still in PENDING status — idempotent if already BILLED.
  async updateBilled(
    db: TransactionDatabase,
    id: string,
    tenantId: string,
    billedCredits: string,
    walletTxnId: string,
  ): Promise<UsageEventRecord> {
    const result = await db.client.query<UsageEventRow>(`
      UPDATE billing.usage_events
      SET status = 'BILLED',
          billed_credits = $3::numeric,
          wallet_txn_id = $4::uuid,
          updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING'
      RETURNING ${USAGE_EVENT_COLUMNS}
    `, [id, tenantId, billedCredits, walletTxnId]);

    if (result.rows[0]) return mapUsageEvent(result.rows[0]);

    // Row was not PENDING — fetch current state for the caller
    const current = await db.client.query<UsageEventRow>(`
      SELECT ${USAGE_EVENT_COLUMNS} FROM billing.usage_events WHERE id = $1 AND tenant_id = $2
    `, [id, tenantId]);

    if (!current.rows[0]) throw new Error(`Usage event ${id} not found during BILLED update`);
    return mapUsageEvent(current.rows[0]);
  },

  async findByIdempotencyKey(
    db: TransactionDatabase,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<UsageEventRecord | null> {
    const result = await db.client.query<UsageEventRow>(`
      SELECT ${USAGE_EVENT_COLUMNS}
      FROM billing.usage_events
      WHERE tenant_id = $1 AND idempotency_key = $2
    `, [tenantId, idempotencyKey]);
    return result.rows[0] ? mapUsageEvent(result.rows[0]) : null;
  },
};
