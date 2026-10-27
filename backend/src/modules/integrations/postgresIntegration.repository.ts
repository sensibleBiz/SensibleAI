import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { IntegrationInput } from "./integration.types.js";

interface IntegrationRow extends QueryResultRow {
  id: string; outlet_id: string; integration_key: string; integration_type: string;
  description: string; access_token: string | null; active: boolean; auto_assign_enabled: boolean;
  auto_assign_user_id: string | null; auto_assign_employee_name: string | null;
  created_at: Date; updated_at: Date;
}
const fields = `id,outlet_id,integration_key,integration_type,description,access_token,active,
  auto_assign_enabled,auto_assign_user_id,auto_assign_employee_name,created_at,updated_at`;
const map = (row: IntegrationRow) => ({
  id: row.id, outletId: row.outlet_id, integrationKey: row.integration_key, type: row.integration_type,
  description: row.description,
  // Never return the raw token to callers — expose only whether one is configured.
  hasAccessToken: row.access_token !== null && row.access_token !== "",
  isActive: row.active,
  autoassignenabled: row.auto_assign_enabled, autoAssignUserId: row.auto_assign_user_id ?? undefined,
  autoAssignEmployeeName: row.auto_assign_employee_name ?? undefined,
  createdDate: row.created_at.getTime(), modifiedDate: row.updated_at.getTime(),
});

export const postgresIntegrationRepository = {
  async list(db: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await db.client.query<IntegrationRow>(
      `SELECT ${fields} FROM crm.integrations WHERE tenant_id=$1 AND outlet_id=$2 ORDER BY updated_at DESC`,
      [tenantId, outletId],
    );
    return result.rows.map(map);
  },
  async create(db: TransactionDatabase, tenantId: string, input: IntegrationInput) {
    const result = await db.client.query<IntegrationRow>(
      `INSERT INTO crm.integrations (tenant_id,outlet_id,integration_key,integration_type,description,access_token,active,
        auto_assign_enabled,auto_assign_user_id,auto_assign_employee_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${fields}`,
      [tenantId,input.outletId,input.integrationKey,input.type,input.description,input.accessToken ?? null,
        input.isActive ?? true,input.autoassignenabled ?? false,input.autoAssignUserId ?? null,input.autoAssignEmployeeName ?? null],
    );
    return map(result.rows[0]!);
  },
  async update(db: TransactionDatabase, tenantId: string, integrationId: string, input: Partial<IntegrationInput>) {
    const result = await db.client.query<IntegrationRow>(
      `UPDATE crm.integrations SET integration_key=COALESCE($4,integration_key), integration_type=COALESCE($5,integration_type),
        description=COALESCE($6,description), access_token=COALESCE($7,access_token), active=COALESCE($8,active),
        auto_assign_enabled=COALESCE($9,auto_assign_enabled), auto_assign_user_id=$10,
        auto_assign_employee_name=$11, updated_at=now()
       WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 RETURNING ${fields}`,
      [tenantId,input.outletId,integrationId,input.integrationKey ?? null,input.type ?? null,input.description ?? null,
        input.accessToken ?? null,input.isActive ?? null,input.autoassignenabled ?? null,input.autoAssignUserId ?? null,
        input.autoAssignEmployeeName ?? null],
    );
    return result.rows[0] ? map(result.rows[0]) : null;
  },
  async delete(db: TransactionDatabase, tenantId: string, outletId: string, integrationId: string) {
    const result = await db.client.query(`DELETE FROM crm.integrations WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3`, [tenantId,outletId,integrationId]);
    return (result.rowCount ?? 0) > 0;
  },
  async listFacebookPages(db: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await db.client.query(`SELECT id,provider_page_id,page_name,category,active,metadata,created_at,updated_at
      FROM crm.facebook_pages WHERE tenant_id=$1 AND outlet_id=$2 ORDER BY page_name`, [tenantId,outletId]);
    return result.rows.map((row) => ({ id: row.id, key: row.id, pageId: row.provider_page_id, pageName: row.page_name,
      category: row.category, isActive: row.active, ...row.metadata, createdDate: row.created_at.getTime(), updatedDate: row.updated_at.getTime() }));
  },
  async deleteFacebookPage(db: TransactionDatabase, tenantId: string, outletId: string, pageId: string) {
    const result = await db.client.query(`DELETE FROM crm.facebook_pages WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3`, [tenantId,outletId,pageId]);
    return (result.rowCount ?? 0) > 0;
  },
};
