import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { normalizeRoleForStorage } from "../../utils/accessControl.js";
import type {
  OutletFeatureAccessResult,
  OutletSummary,
  PermissionRecord,
  PermissionUserRecord,
  PermissionWriteInput,
  UserAccessUpdateInput,
  UserAccessUpdateResult,
} from "../../types/accessControl.types.js";

interface PermissionRow extends QueryResultRow {
  id: string;
  permission_key: string;
  catalog_key: string | null;
  label: string | null;
  description: string | null;
  category: string | null;
  created_at: Date;
  updated_at: Date;
}

interface UserAccessRow extends QueryResultRow {
  user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  profile_role: string | null;
  department: string | null;
  verified: boolean;
  outlet_permissions: string[] | null;
  department_access: string[] | null;
  assignment_role: string | null;
}

const toMillis = (value: Date) => value.getTime();

const permissionRecord = (row: PermissionRow): PermissionRecord => ({
  id: row.id,
  key: row.catalog_key || row.permission_key,
  ...(row.label ? { label: row.label } : {}),
  ...(row.description ? { description: row.description } : {}),
  ...(row.category ? { category: row.category } : {}),
  createdAt: toMillis(row.created_at),
  updatedAt: toMillis(row.updated_at),
});

const ASSIGNABLE_PROFILE_ROLES = new Set([
  "USER",
  "SUPER_ADMIN",
  "SUB_SUPER_ADMIN",
  "ADMIN",
  "SUPPORT",
  "MANAGER",
]);

export const resolvePermissionUserRole = (
  profileRole: string | null,
  assignmentRole: string | null,
) => {
  const assignment = normalizeRoleForStorage(assignmentRole ?? undefined);
  if (ASSIGNABLE_PROFILE_ROLES.has(assignment)) return assignment;
  const profile = normalizeRoleForStorage(profileRole ?? undefined);
  return ASSIGNABLE_PROFILE_ROLES.has(profile) ? profile : "USER";
};

export const derivePermissionKeys = (inputKey: string) => {
  const key = inputKey.trim();
  if (/^[a-z][a-z0-9_.]*$/.test(key)) {
    return {
      permissionKey: key,
      catalogKey: `CRM_${key.replace(/[.]/g, "_").toUpperCase()}`,
    };
  }
  const catalogKey = key.toUpperCase();
  const withoutPrefix = catalogKey.startsWith("CRM_") ? catalogKey.slice(4) : catalogKey;
  return {
    permissionKey: withoutPrefix.toLowerCase().replace(/_/g, "."),
    catalogKey,
  };
};

export class PostgresAccessControlRepository {
  async listPermissions(database: TransactionDatabase): Promise<PermissionRecord[]> {
    const result = await database.client.query<PermissionRow>(`
      SELECT id, permission_key, catalog_key, label, description, category, created_at, updated_at
      FROM iam.permissions
      WHERE catalog_active
      ORDER BY coalesce(catalog_key, permission_key)
    `);
    return result.rows.map(permissionRecord);
  }

  async createPermission(
    database: TransactionDatabase,
    input: PermissionWriteInput,
    actorId: string,
  ): Promise<PermissionRecord> {
    const keys = derivePermissionKeys(input.key);
    const existing = await database.client.query<{ id: string }>(`
      SELECT id FROM iam.permissions
      WHERE permission_key = $1 OR catalog_key = $2
      LIMIT 1
    `, [keys.permissionKey, keys.catalogKey]);
    if (existing.rowCount) {
      throw new AppError(409, "Permission key already exists", "PERMISSION_KEY_EXISTS");
    }
    const created = await database.client.query<PermissionRow>(`
      INSERT INTO iam.permissions (permission_key, catalog_key, label, description, category, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      RETURNING id, permission_key, catalog_key, label, description, category, created_at, updated_at
    `, [keys.permissionKey, keys.catalogKey, input.label, input.description, input.category, actorId]);
    return permissionRecord(created.rows[0]!);
  }

  async updatePermission(
    database: TransactionDatabase,
    permissionId: string,
    input: Omit<PermissionWriteInput, "key">,
    actorId: string,
  ): Promise<PermissionRecord> {
    const updated = await database.client.query<PermissionRow>(`
      UPDATE iam.permissions
      SET label = $2, description = $3, category = $4, updated_by = $5
      WHERE id = $1 AND catalog_active
      RETURNING id, permission_key, catalog_key, label, description, category, created_at, updated_at
    `, [permissionId, input.label, input.description, input.category, actorId]);
    if (!updated.rowCount) throw new AppError(404, "Permission not found", "PERMISSION_NOT_FOUND");
    return permissionRecord(updated.rows[0]!);
  }

  async deletePermission(database: TransactionDatabase, permissionId: string) {
    const existing = await database.client.query<{ id: string }>(
      "SELECT id FROM iam.permissions WHERE id = $1 FOR UPDATE",
      [permissionId],
    );
    if (!existing.rowCount) return { permissionId, deleted: false, idempotent: true };
    await database.client.query("DELETE FROM iam.permissions WHERE id = $1", [permissionId]);
    return { permissionId, deleted: true, idempotent: false };
  }

  async resolveOutlet(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ id: string; name: string; business_id: string }>(
      "SELECT id, name, business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active",
      [tenantId, outletId],
    );
    return result.rows[0] ?? null;
  }

  async listCrmOutlets(database: TransactionDatabase, tenantId: string, outletIds?: string[]): Promise<OutletSummary[]> {
    if (outletIds && outletIds.length === 0) return [];
    const result = outletIds
      ? await database.client.query<OutletSummary & QueryResultRow>(`
          SELECT id, name, true AS active, extract(epoch from created_at)::bigint * 1000 AS "createdDate"
          FROM tenancy.outlets
          WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND active
          ORDER BY name
        `, [tenantId, outletIds])
      : await database.client.query<OutletSummary & QueryResultRow>(`
          SELECT id, name, true AS active, extract(epoch from created_at)::bigint * 1000 AS "createdDate"
          FROM tenancy.outlets
          WHERE tenant_id = $1 AND active
          ORDER BY name
        `, [tenantId]);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      active: true,
      ...(row.createdDate ? { createdDate: Number(row.createdDate) } : {}),
    }));
  }

  async listPermissionUsers(database: TransactionDatabase, tenantId: string, outletId: string): Promise<PermissionUserRecord[]> {
    const result = await database.client.query<UserAccessRow>(`
      SELECT usr.id AS user_id, usr.email, usr.phone, usr.display_name,
        (SELECT max(profile.profile_role) FROM crm.user_profiles profile
          WHERE profile.tenant_id = assignment.tenant_id AND profile.user_id = usr.id AND profile.active) AS profile_role,
        (SELECT min(team.department) FROM crm.team_memberships team
          WHERE team.tenant_id = assignment.tenant_id AND team.user_id = usr.id AND team.outlet_id = assignment.outlet_id AND team.active) AS department,
        EXISTS (
          SELECT 1 FROM crm.team_memberships team
          WHERE team.tenant_id = assignment.tenant_id AND team.user_id = usr.id AND team.outlet_id = assignment.outlet_id AND team.active
        ) AS verified,
        coalesce((
          SELECT array_agg(DISTINCT coalesce(permission.catalog_key, permission.permission_key))
          FROM iam.user_outlet_permissions grant_row
          JOIN iam.permissions permission ON permission.id = grant_row.permission_id
          WHERE grant_row.tenant_id = assignment.tenant_id AND grant_row.outlet_id = assignment.outlet_id
            AND grant_row.user_id = usr.id AND permission.catalog_active
        ), '{}') AS outlet_permissions,
        coalesce((
          SELECT array_agg(DISTINCT access.department)
          FROM iam.user_outlet_department_access access
          WHERE access.tenant_id = assignment.tenant_id AND access.outlet_id = assignment.outlet_id AND access.user_id = usr.id
        ), '{}') AS department_access,
        role.name AS assignment_role
      FROM tenancy.outlet_assignments assignment
      JOIN iam.users usr ON usr.id = assignment.user_id AND usr.active
      LEFT JOIN iam.roles role ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id
      WHERE assignment.tenant_id = $1 AND assignment.outlet_id = $2 AND assignment.active
      ORDER BY usr.display_name
    `, [tenantId, outletId]);
    return result.rows.map((row) => this.mapUser(row, outletId));
  }

  async getPermissionUserContext(database: TransactionDatabase, tenantId: string, outletId: string, userId: string) {
    const users = await this.listPermissionUsers(database, tenantId, outletId);
    const user = users.find((item) => item.id === userId);
    if (!user) {
      const missing = await database.client.query<{ id: string }>("SELECT id FROM iam.users WHERE id = $1 AND active", [userId]);
      if (!missing.rowCount) return undefined;
    }
    const departments = await database.client.query<{ department: string }>(`
      SELECT DISTINCT department FROM crm.team_memberships
      WHERE tenant_id = $1 AND outlet_id = $2 AND active
      ORDER BY department
    `, [tenantId, outletId]);
    return {
      user: user ?? null,
      departments: departments.rows.map((row) => row.department),
    };
  }

  async lockUserAccess(database: TransactionDatabase, tenantId: string, outletId: string, userId: string) {
    const assignment = await database.client.query<{ id: string; role_id: string }>(`
      SELECT id, role_id FROM tenancy.outlet_assignments
      WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND active
      FOR UPDATE
    `, [tenantId, outletId, userId]);
    const profile = await database.client.query<{ id: string; profile_role: string }>(`
      SELECT id, profile_role FROM crm.user_profiles
      WHERE tenant_id = $1 AND user_id = $2 AND active
      ORDER BY updated_at DESC
      LIMIT 1
      FOR UPDATE
    `, [tenantId, userId]);
    return {
      assignment: assignment.rows[0] ?? null,
      profile: profile.rows[0] ?? null,
    };
  }

  async updateUserAccess(
    database: TransactionDatabase,
    tenantId: string,
    actorId: string,
    userId: string,
    input: UserAccessUpdateInput,
    storedRole: string,
  ): Promise<UserAccessUpdateResult> {
    const requestedPermissions = Array.from(new Set(
      input.outletPermissions.map((permission) => permission.trim()).filter(Boolean),
    ));
    if (requestedPermissions.length) {
      const supported = await database.client.query<{ key: string }>(`
        SELECT requested.key
        FROM unnest($1::text[]) AS requested(key)
        WHERE EXISTS (
          SELECT 1 FROM iam.permissions permission
          WHERE permission.catalog_active
            AND (permission.permission_key = requested.key OR permission.catalog_key = requested.key)
        )
      `, [requestedPermissions]);
      const supportedKeys = new Set(supported.rows.map((row) => row.key));
      const unsupported = requestedPermissions.filter((permission) => !supportedKeys.has(permission));
      if (unsupported.length) {
        throw new AppError(
          400,
          `Unknown or inactive permission keys: ${unsupported.join(", ")}`,
          "INVALID_PERMISSION_KEYS",
        );
      }
    }
    const role = await database.client.query<{ id: string }>(`
      INSERT INTO iam.roles (tenant_id, name, description)
      VALUES ($1, $2, 'Access-control assigned role')
      ON CONFLICT (tenant_id, name) DO UPDATE SET active = true, updated_at = now()
      RETURNING id
    `, [tenantId, storedRole]);
    const roleId = role.rows[0]!.id;
    await database.client.query(`
      UPDATE tenancy.outlet_assignments
      SET role_id = $4, updated_at = now()
      WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND active
    `, [tenantId, input.outletId, userId, roleId]);
    await database.client.query(`
      UPDATE crm.user_profiles SET profile_role = $3
      WHERE tenant_id = $1 AND user_id = $2 AND active
    `, [tenantId, userId, storedRole]);

    await database.client.query(`
      DELETE FROM iam.user_outlet_department_access
      WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3
    `, [tenantId, input.outletId, userId]);
    for (const department of input.departmentAccessList) {
      await database.client.query(`
        INSERT INTO iam.user_outlet_department_access (tenant_id, outlet_id, user_id, department)
        VALUES ($1, $2, $3, $4)
      `, [tenantId, input.outletId, userId, department]);
    }

    await database.client.query(`
      DELETE FROM iam.user_outlet_permissions
      WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3
    `, [tenantId, input.outletId, userId]);
    if (requestedPermissions.length) {
      await database.client.query(`
        INSERT INTO iam.user_outlet_permissions (tenant_id, outlet_id, user_id, permission_id, created_by)
        SELECT $1, $2, $3, permission.id, $5
        FROM iam.permissions permission
        WHERE permission.catalog_active
          AND (permission.permission_key = ANY($4::text[]) OR permission.catalog_key = ANY($4::text[]))
      `, [tenantId, input.outletId, userId, requestedPermissions, actorId]);
    }

    const granted = await database.client.query<{ key: string }>(`
      SELECT coalesce(permission.catalog_key, permission.permission_key) AS key
      FROM iam.user_outlet_permissions grant_row
      JOIN iam.permissions permission ON permission.id = grant_row.permission_id
      WHERE grant_row.tenant_id = $1 AND grant_row.outlet_id = $2 AND grant_row.user_id = $3
      ORDER BY 1
    `, [tenantId, input.outletId, userId]);

    const updatedAt = Date.now();
    return {
      userId,
      uid: userId,
      permissions: [{
        outletId: input.outletId,
        role: storedRole,
        departmentAccessList: input.departmentAccessList,
        outletPermissions: granted.rows.map((row) => row.key),
      }],
      updatedAt,
    };
  }

  async getFeatureAccess(database: TransactionDatabase, tenantId: string, outletId: string): Promise<OutletFeatureAccessResult> {
    const config = await database.client.query<{ revision: number; is_configured: boolean }>(`
      SELECT revision, is_configured FROM tenancy.outlet_feature_configs
      WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId]);
    const features = await database.client.query<{ feature_key: string }>(`
      SELECT feature_key FROM tenancy.outlet_features
      WHERE tenant_id = $1 AND outlet_id = $2 AND enabled
      ORDER BY feature_key
    `, [tenantId, outletId]);
    const row = config.rows[0];
    return {
      outletId,
      enabledFeatureKeys: features.rows.map((item) => item.feature_key),
      isConfigured: row?.is_configured === true || features.rows.length > 0,
      revision: row?.revision ?? 0,
    };
  }

  async countOutletUsers(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM tenancy.outlet_assignments
      WHERE tenant_id = $1 AND outlet_id = $2 AND active
    `, [tenantId, outletId]);
    return Number(result.rows[0]?.count ?? 0);
  }

  async saveFeatureAccess(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    enabledFeatureKeys: string[],
    expectedRevision: number | undefined,
    actorId: string,
  ): Promise<OutletFeatureAccessResult> {
    await database.client.query(`
      INSERT INTO tenancy.outlet_feature_configs (tenant_id, outlet_id, revision, is_configured, updated_by, updated_at_ms)
      VALUES ($1, $2, 0, false, $3, $4)
      ON CONFLICT (outlet_id) DO NOTHING
    `, [tenantId, outletId, actorId, Date.now()]);
    const locked = await database.client.query<{ revision: number }>(`
      SELECT revision FROM tenancy.outlet_feature_configs
      WHERE tenant_id = $1 AND outlet_id = $2
      FOR UPDATE
    `, [tenantId, outletId]);
    const currentRevision = locked.rows[0]?.revision ?? 0;
    if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
      throw new AppError(
        409,
        "Outlet feature access changed since it was loaded. Refresh and try again.",
        "FEATURE_ACCESS_CONFLICT",
      );
    }
    await database.client.query(`
      DELETE FROM tenancy.outlet_features WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId]);
    for (const featureKey of enabledFeatureKeys) {
      await database.client.query(`
        INSERT INTO tenancy.outlet_features (tenant_id, outlet_id, feature_key, enabled)
        VALUES ($1, $2, $3, true)
      `, [tenantId, outletId, featureKey]);
    }
    const nextRevision = currentRevision + 1;
    await database.client.query(`
      UPDATE tenancy.outlet_feature_configs
      SET revision = $3, is_configured = true, updated_by = $4, updated_at_ms = $5
      WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId, nextRevision, actorId, Date.now()]);
    return {
      outletId,
      enabledFeatureKeys,
      isConfigured: true,
      revision: nextRevision,
    };
  }

  async writeAudit(
    database: TransactionDatabase,
    tenantId: string,
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    outletId: string | null,
    beforeState: unknown,
    afterState: unknown,
  ) {
    await database.client.query(`
      INSERT INTO iam.access_control_audit
        (tenant_id, outlet_id, actor_user_id, action, target_type, target_id, before_state, after_state)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
    `, [
      tenantId,
      outletId,
      actorId,
      action,
      targetType,
      targetId,
      beforeState == null ? null : JSON.stringify(beforeState),
      afterState == null ? null : JSON.stringify(afterState),
    ]);
  }

  async actorScope(database: TransactionDatabase, tenantId: string, userId: string, outletId: string) {
    const result = await database.client.query<{
      is_tenant_admin: boolean;
      profile_role: string | null;
      department: string | null;
      department_access: string[] | null;
    }>(`
      SELECT membership.is_tenant_admin,
        (SELECT max(profile.profile_role) FROM crm.user_profiles profile
          WHERE profile.tenant_id = membership.tenant_id AND profile.user_id = membership.user_id AND profile.active) AS profile_role,
        (SELECT min(team.department) FROM crm.team_memberships team
          WHERE team.tenant_id = membership.tenant_id AND team.user_id = membership.user_id
            AND team.outlet_id = $3 AND team.active) AS department,
        coalesce((
          SELECT array_agg(DISTINCT access.department)
          FROM iam.user_outlet_department_access access
          WHERE access.tenant_id = membership.tenant_id AND access.outlet_id = $3 AND access.user_id = membership.user_id
        ), '{}') AS department_access
      FROM tenancy.tenant_memberships membership
      WHERE membership.tenant_id = $1 AND membership.user_id = $2 AND membership.active
    `, [tenantId, userId, outletId]);
    return result.rows[0] ?? null;
  }

  private mapUser(row: UserAccessRow, outletId: string): PermissionUserRecord {
    const role = resolvePermissionUserRole(row.profile_role, row.assignment_role);
    return {
      id: row.user_id,
      uid: row.user_id,
      name: row.display_name,
      email: row.email ?? "",
      phone_number: row.phone ?? "",
      role,
      outletId,
      outlets: [outletId],
      ...(row.department ? { department: row.department } : {}),
      verified: row.verified,
      permissions: [{
        outletId,
        role,
        departmentAccessList: row.department_access ?? [],
        outletPermissions: row.outlet_permissions ?? [],
      }],
    };
  }
}

export const postgresAccessControlRepository = new PostgresAccessControlRepository();
