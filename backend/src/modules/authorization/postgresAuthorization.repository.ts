import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";

interface CurrentAccessRow extends QueryResultRow {
  user_id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  is_tenant_admin: boolean;
  outlet_id: string | null;
  outlet_name: string | null;
  business_id: string | null;
  business_name: string | null;
  role_id: string | null;
  role_name: string | null;
  permissions: string[] | null;
  profile_role: string | null;
  departments: string[] | null;
  zones: string[] | null;
}

export interface PostgresCurrentAccess {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    displayName: string;
  };
  tenant: { id: string; isTenantAdmin: boolean };
  outlets: Array<{
    id: string;
    name: string;
    businessId: string;
    businessName: string;
    roleId: string;
    roleName: string;
    permissions: string[];
    profileRole: string | null;
    departments: string[];
    zones: string[];
  }>;
}

export class PostgresAuthorizationRepository {
  async getCurrentAccess(
    database: TransactionDatabase,
    userId: string,
    tenantId: string,
  ): Promise<PostgresCurrentAccess> {
    const result = await database.client.query<CurrentAccessRow>(`
      SELECT usr.id AS user_id, usr.email, usr.phone, usr.display_name,
        membership.is_tenant_admin, outlet.id AS outlet_id, outlet.name AS outlet_name,
        outlet.business_id, business.name AS business_name,
        role.id AS role_id, role.name AS role_name,
        coalesce(array_agg(DISTINCT permission_key.key)
          FILTER (WHERE permission_key.key IS NOT NULL), '{}') AS permissions,
        (SELECT max(profile.profile_role) FROM crm.user_profiles profile
          WHERE profile.tenant_id = membership.tenant_id AND profile.user_id = usr.id AND profile.business_id = outlet.business_id AND profile.active) AS profile_role,
        coalesce((SELECT array_agg(DISTINCT team.department) FROM crm.team_memberships team
          WHERE team.tenant_id = membership.tenant_id AND team.user_id = usr.id AND team.outlet_id = outlet.id AND team.active), '{}') AS departments,
        coalesce((SELECT array_agg(DISTINCT team.zone) FILTER (WHERE team.zone IS NOT NULL) FROM crm.team_memberships team
          WHERE team.tenant_id = membership.tenant_id AND team.user_id = usr.id AND team.outlet_id = outlet.id AND team.active), '{}') AS zones
      FROM iam.users usr
      JOIN tenancy.tenant_memberships membership
        ON membership.user_id = usr.id AND membership.tenant_id = $2 AND membership.active
      LEFT JOIN tenancy.outlet_assignments assignment
        ON assignment.user_id = usr.id AND assignment.tenant_id = membership.tenant_id AND assignment.active
      LEFT JOIN tenancy.outlets outlet
        ON outlet.id = assignment.outlet_id AND outlet.tenant_id = membership.tenant_id AND outlet.active
      LEFT JOIN tenancy.businesses business
        ON business.id = outlet.business_id AND business.tenant_id = membership.tenant_id AND business.active
      LEFT JOIN iam.roles role
        ON role.id = assignment.role_id AND role.tenant_id = membership.tenant_id AND role.active
      LEFT JOIN LATERAL (
        SELECT unnest(ARRAY[
          permission.permission_key,
          permission.catalog_key
        ]) AS key
        FROM (
          SELECT role_permission.permission_id
          FROM iam.role_permissions role_permission
          WHERE role_permission.role_id = role.id AND role_permission.tenant_id = membership.tenant_id
          UNION
          SELECT grant_row.permission_id
          FROM iam.user_outlet_permissions grant_row
          WHERE grant_row.tenant_id = membership.tenant_id
            AND grant_row.user_id = usr.id
            AND grant_row.outlet_id = outlet.id
        ) granted
        JOIN iam.permissions permission ON permission.id = granted.permission_id AND permission.catalog_active
      ) permission_key ON true
      WHERE usr.id = $1 AND usr.active
      GROUP BY usr.id, usr.email, usr.phone, usr.display_name,
        membership.tenant_id, membership.is_tenant_admin, outlet.id, outlet.name, outlet.business_id, business.name, role.id, role.name
      ORDER BY business.name NULLS LAST, outlet.name NULLS LAST, role.name NULLS LAST
    `, [userId, tenantId]);

    const identity = result.rows[0];
    if (!identity) {
      throw new AppError(403, "PostgreSQL membership is not active", "POSTGRES_ACCESS_DENIED");
    }

    return {
      user: {
        id: identity.user_id,
        email: identity.email,
        phone: identity.phone,
        displayName: identity.display_name,
      },
      tenant: { id: tenantId, isTenantAdmin: identity.is_tenant_admin },
      outlets: result.rows.flatMap((row) =>
        row.outlet_id && row.outlet_name && row.business_id && row.business_name && row.role_id && row.role_name
          ? [{
              id: row.outlet_id,
              name: row.outlet_name,
              businessId: row.business_id,
              businessName: row.business_name,
              roleId: row.role_id,
              roleName: row.role_name,
              permissions: row.permissions ?? [],
              profileRole: row.profile_role,
              departments: row.departments ?? [],
              zones: row.zones ?? [],
            }]
          : [],
      ),
    };
  }

  async hasOutletAccess(
    database: TransactionDatabase,
    userId: string,
    tenantId: string,
    outletId: string,
  ) {
    const result = await database.client.query<{ allowed: boolean }>(`
      SELECT tenancy.can_access_outlet($2::uuid, $3::uuid) AND EXISTS (
        SELECT 1 FROM tenancy.tenant_memberships membership
        WHERE membership.user_id = $1 AND membership.tenant_id = $2 AND membership.active
      ) AS allowed
    `, [userId, tenantId, outletId]);
    return result.rows[0]?.allowed === true;
  }

  async hasPermission(
    database: TransactionDatabase,
    userId: string,
    tenantId: string,
    permissionKey: string,
  ) {
    const result = await database.client.query<{ allowed: boolean }>(`
      SELECT membership.is_tenant_admin OR EXISTS (
        SELECT 1
        FROM tenancy.outlet_assignments assignment
        JOIN iam.roles role ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id AND role.active
        JOIN iam.role_permissions role_permission
          ON role_permission.role_id = role.id AND role_permission.tenant_id = role.tenant_id
        JOIN iam.permissions permission ON permission.id = role_permission.permission_id
        WHERE assignment.user_id = $1 AND assignment.tenant_id = $2
          AND assignment.active AND permission.catalog_active
          AND (permission.permission_key = $3 OR permission.catalog_key = $3)
      ) OR EXISTS (
        SELECT 1
        FROM iam.user_outlet_permissions grant_row
        JOIN iam.permissions permission ON permission.id = grant_row.permission_id
        WHERE grant_row.user_id = $1 AND grant_row.tenant_id = $2
          AND permission.catalog_active
          AND (permission.permission_key = $3 OR permission.catalog_key = $3)
      ) AS allowed
      FROM tenancy.tenant_memberships membership
      WHERE membership.user_id = $1 AND membership.tenant_id = $2 AND membership.active
    `, [userId, tenantId, permissionKey]);
    return result.rows[0]?.allowed === true;
  }

  async hasOutletPermission(
    database: TransactionDatabase,
    userId: string,
    tenantId: string,
    outletId: string,
    permissionKey: string,
  ) {
    const result = await database.client.query<{ allowed: boolean }>(`
      SELECT membership.is_tenant_admin OR EXISTS (
        SELECT 1
        FROM tenancy.outlet_assignments assignment
        JOIN iam.roles role ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id AND role.active
        JOIN iam.role_permissions role_permission
          ON role_permission.role_id = role.id AND role_permission.tenant_id = role.tenant_id
        JOIN iam.permissions permission ON permission.id = role_permission.permission_id
        WHERE assignment.user_id = $1 AND assignment.tenant_id = $2 AND assignment.outlet_id = $3
          AND assignment.active AND permission.catalog_active
          AND (permission.permission_key = $4 OR permission.catalog_key = $4)
      ) OR EXISTS (
        SELECT 1
        FROM iam.user_outlet_permissions grant_row
        JOIN iam.permissions permission ON permission.id = grant_row.permission_id
        WHERE grant_row.user_id = $1 AND grant_row.tenant_id = $2 AND grant_row.outlet_id = $3
          AND permission.catalog_active
          AND (permission.permission_key = $4 OR permission.catalog_key = $4)
      ) AS allowed
      FROM tenancy.tenant_memberships membership
      WHERE membership.user_id = $1 AND membership.tenant_id = $2 AND membership.active
    `, [userId, tenantId, outletId, permissionKey]);
    return result.rows[0]?.allowed === true;
  }
}

export const postgresAuthorizationRepository = new PostgresAuthorizationRepository();
