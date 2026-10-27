import argon2 from "argon2";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { ARGON2_OPTIONS } from "../auth/auth.service.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { PostgresTeamRepository, postgresTeamRepository } from "./postgresTeam.repository.js";
import type { PostgresTeamCreateInput, PostgresTeamListQuery, PostgresTeamMembershipCreateInput, PostgresTeamUpdateInput } from "./team.types.js";

export class PostgresTeamService {
  constructor(
    private readonly repository: PostgresTeamRepository = postgresTeamRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private async requireRead(database: TransactionDatabase, tenantId: string, actorId: string, outletId: string) {
    if (!await this.authorization.hasOutletAccess(database, actorId, tenantId, outletId)) {
      throw new AppError(403, "Outlet access is required", "POSTGRES_OUTLET_ACCESS_DENIED");
    }
    if (!await this.authorization.hasOutletPermission(database, actorId, tenantId, outletId, "team.read")) {
      throw new AppError(403, "Team read permission is required", "POSTGRES_PERMISSION_DENIED");
    }
  }

  private async requireManage(database: TransactionDatabase, tenantId: string, actorId: string, outletId: string, permission = "team.manage") {
    if (!await this.authorization.hasOutletPermission(database, actorId, tenantId, outletId, permission)) {
      throw new AppError(403, "Team management permission is required", "POSTGRES_PERMISSION_DENIED");
    }
  }

  async list(database: TransactionDatabase, tenantId: string, actorId: string, query: PostgresTeamListQuery) {
    await this.requireRead(database, tenantId, actorId, query.outletId);
    if ((query.department || query.zone) && !await this.repository.canQueryScope(database, tenantId, query.outletId, query.department, query.zone)) {
      throw new AppError(403, "Department or zone access is not permitted", "TEAM_SCOPE_ACCESS_DENIED");
    }
    return this.repository.list(database, tenantId, query);
  }

  async get(database: TransactionDatabase, tenantId: string, actorId: string, outletId: string, userId: string) {
    await this.requireRead(database, tenantId, actorId, outletId);
    const records = await this.repository.get(database, tenantId, outletId, userId);
    if (!records.length) throw new AppError(404, "Team member was not found", "TEAM_MEMBER_NOT_FOUND");
    return records;
  }

  private managerUserId(input: { managerUserId?: string | null; teamHeadProfileId?: string | null; zoneHeadProfileId?: string | null }) {
    if ("managerUserId" in input) return input.managerUserId;
    if ("teamHeadProfileId" in input) return input.teamHeadProfileId;
    if ("zoneHeadProfileId" in input) return input.zoneHeadProfileId;
    return undefined;
  }

  async create(database: TransactionDatabase, tenantId: string, actorId: string, isTenantAdmin: boolean, input: PostgresTeamCreateInput) {
    if (!isTenantAdmin) throw new AppError(403, "Tenant administrator access is required to provision users", "POSTGRES_ADMIN_REQUIRED");
    await this.requireManage(database, tenantId, actorId, input.outletId, "users.create");
    const businessId = await this.repository.outletBusiness(database, tenantId, input.outletId);
    if (!businessId) throw new AppError(404, "Outlet was not found", "OUTLET_NOT_FOUND");
    const managerUserId = this.managerUserId(input) ?? null;
    const managerProfileId = managerUserId
      ? await this.repository.managerProfile(database, tenantId, input.outletId, managerUserId)
      : null;
    if (managerUserId && !managerProfileId) throw new AppError(400, "Manager must be an active member of this outlet", "TEAM_MANAGER_INVALID");
    try {
      const userId = await this.repository.create(database, tenantId, await argon2.hash(input.password, ARGON2_OPTIONS), businessId, input, managerProfileId);
      return { userId, linkedExistingUser: false, teamMember: (await this.repository.get(database, tenantId, input.outletId, userId))[0] };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new AppError(409, "A PostgreSQL user with this email, phone, employee code, or team membership already exists", "POSTGRES_USER_EXISTS");
      throw error;
    }
  }

  async addMembership(database: TransactionDatabase, tenantId: string, actorId: string, userId: string, input: PostgresTeamMembershipCreateInput) {
    await this.requireManage(database, tenantId, actorId, input.outletId);
    const businessId = await this.repository.outletBusiness(database, tenantId, input.outletId);
    if (!businessId) throw new AppError(404, "Outlet was not found", "OUTLET_NOT_FOUND");
    const managerUserId = this.managerUserId(input) ?? null;
    if (managerUserId === userId) throw new AppError(400, "A user cannot manage itself", "TEAM_MANAGER_SELF_REFERENCE");
    const managerProfileId = managerUserId ? await this.repository.managerProfile(database, tenantId, input.outletId, managerUserId) : null;
    if (managerUserId && !managerProfileId) throw new AppError(400, "Manager must be an active member of this outlet", "TEAM_MANAGER_INVALID");
    try {
      if (!await this.repository.addMembership(database, tenantId, userId, businessId, input, managerProfileId)) {
        throw new AppError(404, "PostgreSQL user was not found in this tenant", "POSTGRES_USER_NOT_FOUND");
      }
      return this.get(database, tenantId, actorId, input.outletId, userId);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new AppError(409, "This organizational membership already exists", "TEAM_MEMBERSHIP_EXISTS");
      throw error;
    }
  }
  async update(database: TransactionDatabase, tenantId: string, actorId: string, userId: string, input: PostgresTeamUpdateInput) {
    await this.requireManage(database, tenantId, actorId, input.outletId);
    const managerUserId = this.managerUserId(input);
    if (managerUserId === userId) throw new AppError(400, "A user cannot manage itself", "TEAM_MANAGER_SELF_REFERENCE");
    const managerProfileId = typeof managerUserId === "string"
      ? await this.repository.managerProfile(database, tenantId, input.outletId, managerUserId)
      : managerUserId;
    if (typeof managerUserId === "string" && !managerProfileId) throw new AppError(400, "Manager must be an active member of this outlet", "TEAM_MANAGER_INVALID");
    const updated = await this.repository.update(database, tenantId, userId, input, managerProfileId);
    if (updated === "cycle") throw new AppError(409, "This manager assignment would create a hierarchy cycle", "TEAM_HIERARCHY_CYCLE");
    if (!updated) throw new AppError(404, "Team member was not found", "TEAM_MEMBER_NOT_FOUND");
    return this.get(database, tenantId, actorId, input.outletId, userId);
  }
}

export const postgresTeamService = new PostgresTeamService();
