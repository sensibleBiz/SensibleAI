import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type {
  OutletSubscription,
  PostgresOutlet,
  PostgresOutletCreateInput,
} from "./outlet.types.js";

const CREATED_OUTLET_FEATURES = [
  "dashboard",
  "leads_list",
  "leads_funnel",
  "leads_activities",
  "leads_ringing",
] as const;

interface OutletRow extends QueryResultRow {
  id: string; business_id: string; business_name: string; outlet_code: string;
  name: string; branch: string; address: string; city: string; state: string;
  billing_type: string; renewal_date: Date | null; active: boolean;
  created_at: Date; latitude: string; longitude: string;
}

const mapOutlet = (row: OutletRow): PostgresOutlet => ({
  id: row.id,
  businessId: row.business_id,
  businessName: row.business_name,
  outletCode: row.outlet_code,
  name: row.name,
  branch: row.branch,
  address: row.address,
  city: row.city,
  state: row.state,
  billingType: row.billing_type,
  renewalDate: row.renewal_date?.getTime() ?? 0,
  active: row.active,
  createdDate: row.created_at.getTime(),
  createdBy: "",
  businessMaster: row.business_id,
  eraseOutlet: false,
  latLang: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
});

const outletSelect = `
  SELECT outlet.id, outlet.business_id, business.name AS business_name,
    outlet.outlet_code, outlet.name, outlet.branch, outlet.address, outlet.city,
    outlet.state, outlet.billing_type, outlet.renewal_date, outlet.active,
    outlet.created_at, outlet.latitude, outlet.longitude
  FROM tenancy.outlets outlet
  JOIN tenancy.businesses business ON business.id = outlet.business_id
    AND business.tenant_id = outlet.tenant_id
`;

export const postgresOutletRepository = {
  async findCreationBusinesses(
    database: TransactionDatabase,
    tenantId: string,
    businessId?: string,
  ) {
    const result = await database.client.query<{ id: string; name: string }>(`
      SELECT business.id, business.name
      FROM tenancy.businesses business
      WHERE business.tenant_id = $1 AND business.active
        AND ($2::uuid IS NULL OR business.id = $2::uuid)
      ORDER BY business.created_at, business.id
      LIMIT 2
    `, [tenantId, businessId ?? null]);
    return result.rows;
  },

  async create(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    userId: string,
    outletCode: string,
    input: PostgresOutletCreateInput,
  ) {
    const renewalDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000);
    const outletResult = await database.client.query<{ id: string }>(`
      INSERT INTO tenancy.outlets (
        tenant_id, business_id, outlet_code, name, branch, address, city, state,
        billing_type, renewal_date, latitude, longitude
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'TRIAL', $9, $10, $11)
      ON CONFLICT (tenant_id, outlet_code) DO NOTHING
      RETURNING id
    `, [tenantId, businessId, outletCode, input.name, input.branch, input.address,
      input.city, input.state, renewalDate, input.latitude ?? 0, input.longitude ?? 0]);
    const outletId = outletResult.rows[0]?.id;
    if (!outletId) return null;

    const roleResult = await database.client.query<{ id: string }>(`
      INSERT INTO iam.roles (tenant_id, name, description)
      VALUES ($1, 'SUPER_ADMIN', 'Tenant owner')
      ON CONFLICT (tenant_id, name) DO UPDATE
        SET active = true, updated_at = now()
      RETURNING id
    `, [tenantId]);
    const roleId = roleResult.rows[0]!.id;

    await database.client.query(`
      INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id)
      VALUES ($1, $2, $3, $4)
    `, [tenantId, outletId, userId, roleId]);

    const profileResult = await database.client.query<{ id: string }>(`
      INSERT INTO crm.user_profiles (tenant_id, business_id, user_id, profile_role)
      VALUES ($1, $2, $3, 'SUPER_ADMIN')
      ON CONFLICT (tenant_id, business_id, user_id) DO UPDATE
        SET profile_role = 'SUPER_ADMIN', active = true, updated_at = now()
      RETURNING id
    `, [tenantId, businessId, userId]);

    await database.client.query(`
      INSERT INTO crm.team_memberships (
        tenant_id, business_id, outlet_id, user_profile_id, user_id,
        department, emp_code, is_on_payroll
      ) VALUES ($1, $2, $3, $4, $5, 'SALES', 'OWNER', false)
      ON CONFLICT DO NOTHING
    `, [tenantId, businessId, outletId, profileResult.rows[0]!.id, userId]);

    await database.client.query(`
      INSERT INTO tenancy.outlet_features (tenant_id, outlet_id, feature_key)
      SELECT $1, $2, feature_key
      FROM unnest($3::text[]) AS feature_key
      ON CONFLICT (outlet_id, feature_key) DO NOTHING
    `, [tenantId, outletId, [...CREATED_OUTLET_FEATURES]]);

    await database.client.query(`
      INSERT INTO tenancy.outlet_subscriptions (
        tenant_id, outlet_id, plan_tier, status, renews_at, created_by, updated_by
      ) VALUES ($1, $2, 'trial', 'trial', $3, $4, $4)
    `, [tenantId, outletId, renewalDate, userId]);

    return outletId;
  },

  async list(database: TransactionDatabase, tenantId: string) {
    const result = await database.client.query<OutletRow>(`${outletSelect}
      WHERE outlet.tenant_id = $1 ORDER BY outlet.name`, [tenantId]);
    return result.rows.map(mapOutlet);
  },

  async find(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<OutletRow>(`${outletSelect}
      WHERE outlet.tenant_id = $1 AND outlet.id = $2`, [tenantId, outletId]);
    return result.rows[0] ? mapOutlet(result.rows[0]) : null;
  },

  async update(database: TransactionDatabase, tenantId: string, outletId: string,
    input: Partial<Pick<PostgresOutlet, "name" | "branch" | "address" | "city" | "state">>) {
    await database.client.query(`UPDATE tenancy.outlets SET
      name = coalesce($3, name), branch = coalesce($4, branch),
      address = coalesce($5, address), city = coalesce($6, city), state = coalesce($7, state)
      WHERE tenant_id = $1 AND id = $2`, [tenantId, outletId, input.name ?? null,
      input.branch ?? null, input.address ?? null, input.city ?? null, input.state ?? null]);
    return this.find(database, tenantId, outletId);
  },

  async getPlanCatalog(database: TransactionDatabase, tenantId: string) {
    const result = await database.client.query<{ features: unknown[] }>(
      "SELECT features FROM tenancy.plan_catalogs WHERE tenant_id = $1", [tenantId]);
    return result.rows[0]?.features ?? [];
  },

  async savePlanCatalog(database: TransactionDatabase, tenantId: string, userId: string, features: unknown[]) {
    const result = await database.client.query<{ features: unknown[] }>(`
      INSERT INTO tenancy.plan_catalogs (tenant_id, features, updated_by)
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (tenant_id) DO UPDATE SET features = EXCLUDED.features,
        updated_by = EXCLUDED.updated_by, updated_at = now()
      RETURNING features`, [tenantId, JSON.stringify(features), userId]);
    return result.rows[0]?.features ?? [];
  },

  async getSubscription(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<QueryResultRow & {
      id: string; outlet_id: string; plan_tier: OutletSubscription["planTier"];
      status: OutletSubscription["status"]; amount: string; permitted_users: number;
      starts_at: Date; renews_at: Date; external_transaction_id: string | null;
    }>(`SELECT id, outlet_id, plan_tier, status, amount, permitted_users,
      starts_at, renews_at, external_transaction_id
      FROM tenancy.outlet_subscriptions
      WHERE tenant_id = $1 AND outlet_id = $2
      ORDER BY starts_at DESC LIMIT 1`, [tenantId, outletId]);
    const row = result.rows[0];
    return row ? {
      id: row.id, outletId: row.outlet_id, planTier: row.plan_tier, status: row.status,
      amount: Number(row.amount), permittedUsers: row.permitted_users,
      startsAt: row.starts_at.getTime(), renewsAt: row.renews_at.getTime(),
      externalTransactionId: row.external_transaction_id,
    } satisfies OutletSubscription : null;
  },
};
