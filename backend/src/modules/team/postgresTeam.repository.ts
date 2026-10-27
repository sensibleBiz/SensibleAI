import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { PostgresTeamCreateInput, PostgresTeamListQuery, PostgresTeamMember, PostgresTeamMembershipCreateInput, PostgresTeamRole, PostgresTeamUpdateInput } from "./team.types.js";

interface TeamRow extends QueryResultRow {
  id: string; user_id: string; user_profile_id: string; user_name: string;
  email: string | null; phone: string | null; profile_role: PostgresTeamRole;
  department: PostgresTeamMember["department"]; outlet_id: string; outlet_name: string;
  business_id: string; zones: string[]; manager_user_id: string | null;
  emp_code: string; is_on_payroll: boolean; active: boolean; created_at: Date; updated_at: Date;
}

const mapRow = (row: TeamRow): PostgresTeamMember => ({
  id: row.id, userId: row.user_id, userProfileId: row.user_id, userName: row.user_name,
  email: row.email, phone: row.phone, roleInZone: row.profile_role, department: row.department,
  outletId: row.outlet_id, outletName: row.outlet_name, businessId: row.business_id,
  zoneList: row.zones, teamHeadProfileId: row.manager_user_id, zoneHeadProfileId: row.manager_user_id,
  empCode: row.emp_code, isOnPayRoll: row.is_on_payroll, isActive: row.active,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const selectTeam = `
  SELECT min(team.id::text)::uuid AS id, usr.id AS user_id, profile.id AS user_profile_id,
    usr.display_name AS user_name, usr.email, usr.phone, profile.profile_role,
    team.department, team.outlet_id, outlet.name AS outlet_name, team.business_id,
    coalesce(array_agg(DISTINCT team.zone) FILTER (WHERE team.zone IS NOT NULL), '{}') AS zones,
    manager.user_id AS manager_user_id, min(team.emp_code) AS emp_code,
    bool_and(team.is_on_payroll) AS is_on_payroll, bool_or(team.active) AS active,
    min(team.created_at) AS created_at, max(team.updated_at) AS updated_at
  FROM crm.team_memberships team
  JOIN crm.user_profiles profile ON profile.id = team.user_profile_id AND profile.tenant_id = team.tenant_id
  JOIN iam.users usr ON usr.id = team.user_id
  JOIN tenancy.outlets outlet ON outlet.id = team.outlet_id AND outlet.tenant_id = team.tenant_id
  LEFT JOIN crm.user_profiles manager ON manager.id = team.manager_profile_id AND manager.tenant_id = team.tenant_id
`;

export class PostgresTeamRepository {
  async canQueryScope(database: TransactionDatabase, tenantId: string, outletId: string, department?: string, zone?: string) {
    const result = await database.client.query<{ allowed: boolean }>(`
      SELECT tenancy.is_tenant_admin($1) OR EXISTS (
        SELECT 1 FROM crm.user_profiles profile
        JOIN crm.team_memberships own_team ON own_team.user_profile_id=profile.id AND own_team.tenant_id=profile.tenant_id
        WHERE profile.tenant_id=$1 AND profile.user_id=iam.current_user_id()
          AND profile.profile_role='SUPER_ADMIN' AND profile.active
          AND own_team.outlet_id=$2 AND own_team.active
      ) OR EXISTS (
        SELECT 1 FROM crm.team_memberships own_team
        WHERE own_team.tenant_id=$1 AND own_team.user_id=iam.current_user_id()
          AND own_team.outlet_id=$2 AND own_team.active
          AND ($3::text IS NULL OR own_team.department=$3)
          AND ($4::text IS NULL OR own_team.zone IS NULL OR upper(own_team.zone)=upper($4))
      ) AS allowed`, [tenantId, outletId, department ?? null, zone ?? null]);
    return result.rows[0]?.allowed === true;
  }
  async list(database: TransactionDatabase, tenantId: string, query: PostgresTeamListQuery) {
    const values: unknown[] = [tenantId, query.outletId];
    const clauses = ["team.tenant_id = $1", "team.outlet_id = $2"];
    const add = (sql: string, value: unknown) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
    if (query.department) add("team.department = ?", query.department);
    if (query.zone) add("upper(team.zone) = upper(?)", query.zone);
    if (query.active !== undefined) add("team.active = ?", query.active);
    if (query.search) {
      values.push(query.search);
      const parameter = "$" + values.length;
      clauses.push(`(usr.display_name ILIKE '%' || ${parameter} || '%' OR coalesce(usr.email, '') ILIKE '%' || ${parameter} || '%' OR coalesce(usr.phone, '') ILIKE '%' || ${parameter} || '%' OR team.emp_code ILIKE '%' || ${parameter} || '%')`);
    }
    if (query.cursor) add("team.id > ?", query.cursor);
    values.push(query.limit + 1);
    const result = await database.client.query<TeamRow>(`${selectTeam}
      WHERE ${clauses.join(" AND ")}
      GROUP BY usr.id, profile.id, profile.profile_role, team.department, team.outlet_id,
        outlet.name, team.business_id, manager.user_id
      ORDER BY min(team.id::text) LIMIT $${values.length}`, values);
    const hasMore = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit);
    return { items: rows.map(mapRow), nextCursor: hasMore ? rows.at(-1)?.id ?? null : null };
  }

  async get(database: TransactionDatabase, tenantId: string, outletId: string, userId: string) {
    const result = await database.client.query<TeamRow>(`${selectTeam}
      WHERE team.tenant_id = $1 AND team.outlet_id = $2 AND team.user_id = $3
      GROUP BY usr.id, profile.id, profile.profile_role, team.department, team.outlet_id,
        outlet.name, team.business_id, manager.user_id ORDER BY min(team.id::text)`, [tenantId, outletId, userId]);
    return result.rows.map(mapRow);
  }

  async outletBusiness(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ business_id: string }>(
      "SELECT business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active", [tenantId, outletId]);
    return result.rows[0]?.business_id ?? null;
  }

  async managerProfile(database: TransactionDatabase, tenantId: string, outletId: string, managerUserId: string) {
    const result = await database.client.query<{ id: string }>(`
      SELECT profile.id FROM crm.user_profiles profile
      JOIN crm.team_memberships team ON team.user_profile_id = profile.id AND team.tenant_id = profile.tenant_id
      WHERE profile.tenant_id = $1 AND profile.user_id = $2 AND profile.active
        AND team.outlet_id = $3 AND team.active LIMIT 1`, [tenantId, managerUserId, outletId]);
    return result.rows[0]?.id ?? null;
  }

  async wouldCreateCycle(database: TransactionDatabase, tenantId: string, profileId: string, managerProfileId: string) {
    const result = await database.client.query<{ cycle: boolean }>(`
      WITH RECURSIVE chain(id) AS (
        SELECT $3::uuid UNION
        SELECT team.manager_profile_id FROM crm.team_memberships team JOIN chain ON team.user_profile_id = chain.id
        WHERE team.tenant_id = $1 AND team.manager_profile_id IS NOT NULL
      ) SELECT EXISTS (SELECT 1 FROM chain WHERE id = $2) AS cycle`, [tenantId, profileId, managerProfileId]);
    return result.rows[0]?.cycle === true;
  }

  async create(database: TransactionDatabase, tenantId: string, passwordHash: string, businessId: string, input: PostgresTeamCreateInput, managerProfileId: string | null) {
    const generated = await database.client.query<{ id: string }>("SELECT public.uuid_generate_v7() AS id");
    const userId = generated.rows[0]!.id;
    await database.client.query(`
      INSERT INTO iam.users (id, email, phone, display_name, active) VALUES ($1, $2, $3, $4, $5)`,
      [userId, input.email ?? null, input.phoneNumber ?? null, input.name, input.isActive]);
    await database.client.query(`INSERT INTO tenancy.tenant_memberships (tenant_id, user_id) VALUES ($1, $2)`, [tenantId, userId]);
    await database.client.query(`INSERT INTO iam.user_credentials (user_id, password_hash, state, password_changed_at)
      VALUES ($1, $2, 'argon2id', now())`, [userId, passwordHash]);
    const role = await database.client.query<{ id: string }>(`
      INSERT INTO iam.roles (tenant_id, name, description) VALUES ($1, $2, 'Team role created by PostgreSQL provisioning')
      ON CONFLICT (tenant_id, name) DO UPDATE SET active = true, updated_at = now() RETURNING id`, [tenantId, input.roleInZone]);
    await database.client.query(`INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id, active)
      VALUES ($1, $2, $3, $4, $5)`, [tenantId, input.outletId, userId, role.rows[0]!.id, input.isActive]);
    const profile = await database.client.query<{ id: string }>(`
      INSERT INTO crm.user_profiles (tenant_id, business_id, user_id, profile_role, active)
      VALUES ($1, $2, $3, $4, $5) RETURNING id`, [tenantId, businessId, userId, input.roleInZone, input.isActive]);
    const profileId = profile.rows[0]!.id;
    const zones = input.zoneList.length ? input.zoneList : [null];
    for (const zone of zones) await database.client.query(`
      INSERT INTO crm.team_memberships
        (tenant_id, business_id, outlet_id, user_profile_id, user_id, department, zone, manager_profile_id, emp_code, is_on_payroll, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [tenantId, businessId, input.outletId, profileId, userId, input.department, zone, managerProfileId, input.empCode, input.isOnPayRoll, input.isActive]);
    return userId;
  }

  async addMembership(database: TransactionDatabase, tenantId: string, userId: string, businessId: string, input: PostgresTeamMembershipCreateInput, managerProfileId: string | null) {
    const member = await database.client.query<{ active: boolean }>(
      "SELECT active FROM tenancy.tenant_memberships WHERE tenant_id=$1 AND user_id=$2", [tenantId, userId]);
    if (member.rows[0]?.active !== true) return false;
    const role = await database.client.query<{ id: string }>(`INSERT INTO iam.roles (tenant_id,name) VALUES ($1,$2)
      ON CONFLICT (tenant_id,name) DO UPDATE SET active=true,updated_at=now() RETURNING id`, [tenantId, input.roleInZone]);
    await database.client.query(`INSERT INTO tenancy.outlet_assignments (tenant_id,outlet_id,user_id,role_id,active)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (outlet_id,user_id,role_id) DO UPDATE SET active=EXCLUDED.active,updated_at=now()`,
      [tenantId,input.outletId,userId,role.rows[0]!.id,input.isActive]);
    const profile = await database.client.query<{ id: string }>(`INSERT INTO crm.user_profiles
      (tenant_id,business_id,user_id,profile_role,active) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (tenant_id,business_id,user_id) DO UPDATE SET profile_role=EXCLUDED.profile_role,active=EXCLUDED.active,updated_at=now()
      RETURNING id`, [tenantId,businessId,userId,input.roleInZone,input.isActive]);
    for (const zone of input.zoneList.length ? input.zoneList : [null]) await database.client.query(`INSERT INTO crm.team_memberships
      (tenant_id,business_id,outlet_id,user_profile_id,user_id,department,zone,manager_profile_id,emp_code,is_on_payroll,active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [tenantId,businessId,input.outletId,profile.rows[0]!.id,userId,input.department,zone,managerProfileId,input.empCode,input.isOnPayRoll,input.isActive]);
    return true;
  }
  async update(database: TransactionDatabase, tenantId: string, userId: string, input: PostgresTeamUpdateInput, managerProfileId: string | null | undefined) {
    const currentDepartment = input.currentDepartment ?? input.department;
    const current = await database.client.query<{ profile_id: string; business_id: string; manager_profile_id: string | null; emp_code: string; is_on_payroll: boolean; active: boolean }>(`
      SELECT team.user_profile_id AS profile_id, team.business_id, team.manager_profile_id,
        team.emp_code, team.is_on_payroll, team.active
      FROM crm.team_memberships team WHERE team.tenant_id=$1 AND team.outlet_id=$2 AND team.user_id=$3 AND team.department=$4 LIMIT 1`,
      [tenantId, input.outletId, userId, currentDepartment]);
    const row = current.rows[0];
    if (!row) return false;
    const effectiveManagerProfileId =
      managerProfileId === undefined ? row.manager_profile_id : managerProfileId;
    if (managerProfileId && await this.wouldCreateCycle(database, tenantId, row.profile_id, managerProfileId)) return "cycle" as const;
    if (input.roleInZone) {
      const role = await database.client.query<{ id: string }>(`INSERT INTO iam.roles (tenant_id,name) VALUES ($1,$2)
        ON CONFLICT (tenant_id,name) DO UPDATE SET active=true,updated_at=now() RETURNING id`, [tenantId, input.roleInZone]);
      await database.client.query("UPDATE crm.user_profiles SET profile_role=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, row.profile_id, input.roleInZone]);
      await database.client.query("UPDATE tenancy.outlet_assignments SET role_id=$4,updated_at=now() WHERE tenant_id=$1 AND outlet_id=$2 AND user_id=$3", [tenantId, input.outletId, userId, role.rows[0]!.id]);
    }
    if (input.zoneList) {
      await database.client.query("DELETE FROM crm.team_memberships WHERE tenant_id=$1 AND outlet_id=$2 AND user_id=$3 AND department=$4", [tenantId,input.outletId,userId,currentDepartment]);
      for (const zone of input.zoneList.length ? input.zoneList : [null]) await database.client.query(`INSERT INTO crm.team_memberships
        (tenant_id,business_id,outlet_id,user_profile_id,user_id,department,zone,manager_profile_id,emp_code,is_on_payroll,active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [tenantId,row.business_id,input.outletId,row.profile_id,userId,input.department,zone,effectiveManagerProfileId,input.empCode??row.emp_code,input.isOnPayRoll??row.is_on_payroll,input.isActive??row.active]);
    } else {
      await database.client.query(`UPDATE crm.team_memberships
        SET manager_profile_id=CASE WHEN $5::boolean THEN $6::uuid ELSE manager_profile_id END,
          department=$7,emp_code=coalesce($8,emp_code),
          is_on_payroll=coalesce($9,is_on_payroll),active=coalesce($10,active)
        WHERE tenant_id=$1 AND outlet_id=$2 AND user_id=$3 AND department=$4`,
      [tenantId,input.outletId,userId,input.department,managerProfileId !== undefined,
        managerProfileId ?? null,input.department,input.empCode,input.isOnPayRoll,input.isActive]);
    }
    if (input.isActive !== undefined) await database.client.query("UPDATE tenancy.outlet_assignments SET active=$4,updated_at=now() WHERE tenant_id=$1 AND outlet_id=$2 AND user_id=$3", [tenantId,input.outletId,userId,input.isActive]);
    return true;
  }
}

export const postgresTeamRepository = new PostgresTeamRepository();
