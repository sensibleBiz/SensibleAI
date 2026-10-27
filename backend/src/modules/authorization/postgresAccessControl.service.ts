import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import type {
  OutletFeatureUpdateInput,
  PermissionUpdateInput,
  PermissionWriteInput,
  PermissionUserRecord,
  UserAccessUpdateInput,
} from "../../types/accessControl.types.js";
import {
  normalizeDepartment,
  normalizeRole,
  normalizeRoleForStorage,
  uniqueStrings,
} from "../../utils/accessControl.js";
import {
  normalizeFeatureKeys,
  OUTLET_FEATURE_KEYS,
} from "../../utils/outletFeatureCatalog.js";
import {
  PostgresAuthorizationRepository,
  postgresAuthorizationRepository,
} from "./postgresAuthorization.repository.js";
import {
  PostgresAccessControlRepository,
  postgresAccessControlRepository,
} from "./postgresAccessControl.repository.js";

const DEFAULT_DEPARTMENTS = ["SALES", "IT", "SUPPORT", "HR", "ACCOUNT", "HARDWARE"];
const PROFILE_ROLES = new Set(["USER", "SUPER_ADMIN", "SUB_SUPER_ADMIN", "ADMIN", "SUPPORT", "MANAGER"]);

const sameValues = (first: string[], second: string[]) => {
  const a = [...new Set(first)].sort();
  const b = [...new Set(second)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export class PostgresAccessControlService {
  constructor(
    private readonly repository: PostgresAccessControlRepository = postgresAccessControlRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private async requireOutlet(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
  ) {
    if (!await this.authorization.hasOutletAccess(database, userId, tenantId, outletId)) {
      throw new AppError(403, "Outlet access is required", "POSTGRES_OUTLET_ACCESS_DENIED");
    }
    const outlet = await this.repository.resolveOutlet(database, tenantId, outletId);
    if (!outlet) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    return outlet;
  }

  private async requirePermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    permission: string,
  ) {
    await this.requireOutlet(database, tenantId, userId, outletId);
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  private canManagePermissionUser(
    actor: { isTenantAdmin: boolean; role: string; departments: string[] },
    target: PermissionUserRecord,
    outletId: string,
    actorCanEdit: boolean,
  ) {
    const assigned = target.outlets?.includes(outletId) === true || target.outletId === outletId
      || target.permissions?.some((entry) => entry.outletId === outletId);
    if (!assigned) return false;
    const actorRole = normalizeRole(actor.role);
    const targetRole = normalizeRole(target.role);
    if (actor.isTenantAdmin || actorRole === "SUPERADMIN") return true;
    if (targetRole === "SUPERADMIN" || targetRole === "SUBSUPERADMIN") return false;
    const isAdmin = actorRole === "ADMIN";
    const isSubSuperAdmin = actorRole === "SUBSUPERADMIN" && actorCanEdit;
    if (!isAdmin && !isSubSuperAdmin && !actorCanEdit) return false;
    if (isSubSuperAdmin && actor.departments.length === 0) return true;
    const targetDepartment = normalizeDepartment(target.department);
    if (actor.departments.length === 0) return isAdmin || actorCanEdit;
    return Boolean(targetDepartment && actor.departments.includes(targetDepartment));
  }

  private async actorContext(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
  ) {
    const scope = await this.repository.actorScope(database, tenantId, userId, outletId);
    if (!scope) throw new AppError(403, "PostgreSQL membership is not active", "POSTGRES_ACCESS_DENIED");
    const canEdit = await this.authorization.hasOutletPermission(
      database, userId, tenantId, outletId, "access_control.users.manage",
    );
    const departments = uniqueStrings(scope.department_access).map(normalizeDepartment);
    return {
      isTenantAdmin: scope.is_tenant_admin,
      role: scope.profile_role ?? (scope.is_tenant_admin ? "SUPER_ADMIN" : "USER"),
      departments: departments.length ? departments : (scope.department ? [normalizeDepartment(scope.department)] : []),
      canEdit,
    };
  }

  async listPermissions(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "access_control.permissions.view");
    return this.repository.listPermissions(database);
  }

  async createPermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PermissionWriteInput,
  ) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "access_control.permissions.create");
    const permission = await this.repository.createPermission(database, input, userId);
    await this.repository.writeAudit(
      database, tenantId, userId, "PERMISSION_CREATED", "permission", permission.id, input.outletId, null, permission,
    );
    return permission;
  }

  async updatePermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    permissionId: string,
    input: PermissionUpdateInput,
  ) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "access_control.permissions.update");
    const permission = await this.repository.updatePermission(database, permissionId, input, userId);
    await this.repository.writeAudit(
      database, tenantId, userId, "PERMISSION_UPDATED", "permission", permissionId, input.outletId, null, permission,
    );
    return permission;
  }

  async deletePermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    permissionId: string,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "access_control.permissions.delete");
    const result = await this.repository.deletePermission(database, permissionId);
    await this.repository.writeAudit(
      database, tenantId, userId, "PERMISSION_DELETED", "permission", permissionId, outletId, null, result,
    );
    return result;
  }

  async listUsers(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "access_control.users.view");
    const actor = await this.actorContext(database, tenantId, userId, outletId);
    const users = await this.repository.listPermissionUsers(database, tenantId, outletId);
    return users.filter((user) => this.canManagePermissionUser(actor, user, outletId, actor.canEdit));
  }

  async getUserDetail(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    targetUserId: string,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "access_control.users.view");
    const actor = await this.actorContext(database, tenantId, userId, outletId);
    const context = await this.repository.getPermissionUserContext(database, tenantId, outletId, targetUserId);
    const permissionMaster = await this.repository.listPermissions(database);
    if (!context?.user) throw new AppError(404, "User not found", "USER_NOT_FOUND");
    if (!this.canManagePermissionUser(actor, context.user, outletId, actor.canEdit)) {
      throw new AppError(403, "You cannot view this user's access", "USER_ACCESS_DENIED");
    }
    return {
      user: context.user,
      permissionMaster,
      departments: Array.from(new Set([...DEFAULT_DEPARTMENTS, ...context.departments])).sort(),
    };
  }

  async updateUserAccess(
    database: TransactionDatabase,
    tenantId: string,
    actorId: string,
    targetUserId: string,
    input: UserAccessUpdateInput,
  ) {
    await this.requirePermission(database, tenantId, actorId, input.outletId, "access_control.users.manage");
    const actor = await this.actorContext(database, tenantId, actorId, input.outletId);
    const locked = await this.repository.lockUserAccess(database, tenantId, input.outletId, targetUserId);
    if (!locked.assignment || !locked.profile) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }
    const context = await this.repository.getPermissionUserContext(database, tenantId, input.outletId, targetUserId);
    if (!context?.user) throw new AppError(404, "User not found", "USER_NOT_FOUND");
    const target = context.user;
    const actorRole = normalizeRole(actor.role);
    const targetRole = normalizeRole(target.role);
    if (!this.canManagePermissionUser(actor, target, input.outletId, actor.canEdit)) {
      throw new AppError(403, "You cannot change this user's outlet access", "USER_ACCESS_UPDATE_DENIED");
    }
    if (targetRole === "SUPERADMIN") {
      throw new AppError(403, "Super Admin access cannot be changed", "OWNER_ACCESS_IMMUTABLE");
    }
    const storedRole = normalizeRoleForStorage(input.role);
    if (!PROFILE_ROLES.has(storedRole)) {
      throw new AppError(400, "Unknown role", "INVALID_ROLE");
    }
    if (normalizeRole(storedRole) === "SUPERADMIN") {
      throw new AppError(403, "The protected Super Admin role cannot be assigned", "OWNER_ROLE_ASSIGNMENT_DENIED");
    }
    if (targetRole === "SUBSUPERADMIN" && actorRole !== "SUPERADMIN" && !actor.isTenantAdmin) {
      throw new AppError(403, "Only the outlet Super Admin can change Sub-Super Admin access", "ROLE_UPDATE_DENIED");
    }
    if (actorRole !== "SUPERADMIN" && !actor.isTenantAdmin && normalizeRole(storedRole) !== targetRole) {
      throw new AppError(403, "Only the outlet Super Admin can change roles", "ROLE_UPDATE_DENIED");
    }
    const requestedDepartments = uniqueStrings(input.departmentAccessList).map(normalizeDepartment);
    const currentDepartments = uniqueStrings(target.permissions?.[0]?.departmentAccessList).map(normalizeDepartment);
    if (actorRole !== "SUPERADMIN" && !actor.isTenantAdmin && !sameValues(currentDepartments, requestedDepartments)) {
      throw new AppError(403, "Only the outlet Super Admin can change department access", "DEPARTMENT_ACCESS_UPDATE_DENIED");
    }
    const result = await this.repository.updateUserAccess(
      database,
      tenantId,
      actorId,
      targetUserId,
      { ...input, departmentAccessList: requestedDepartments, outletPermissions: uniqueStrings(input.outletPermissions) },
      storedRole,
    );
    await this.repository.writeAudit(
      database,
      tenantId,
      actorId,
      "USER_ACCESS_UPDATED",
      "user",
      targetUserId,
      input.outletId,
      { role: target.role, departmentAccessList: currentDepartments, outletPermissions: target.permissions?.[0]?.outletPermissions },
      result,
    );
    return result;
  }

  async listOutlets(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "access_control.features.manage");
    const actor = await this.actorContext(database, tenantId, userId, outletId);
    const actorRole = normalizeRole(actor.role);
    if (actor.isTenantAdmin || actorRole === "SUPERADMIN") {
      return this.repository.listCrmOutlets(database, tenantId);
    }
    const access = await this.authorization.getCurrentAccess(database, userId, tenantId);
    return this.repository.listCrmOutlets(database, tenantId, access.outlets.map((outlet) => outlet.id));
  }

  async getOutletFeatures(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    contextOutletId: string,
    targetOutletId: string,
    includeUserCount: boolean,
  ) {
    await this.requireOutlet(database, tenantId, userId, contextOutletId);
    if (contextOutletId !== targetOutletId) {
      await this.requirePermission(database, tenantId, userId, contextOutletId, "access_control.features.manage");
    }
    const access = await this.repository.getFeatureAccess(database, tenantId, targetOutletId);
    const userCount = includeUserCount
      ? await this.repository.countOutletUsers(database, tenantId, targetOutletId)
      : undefined;
    return {
      ...access,
      enabledFeatureKeys: normalizeFeatureKeys(access.enabledFeatureKeys),
      ...(userCount !== undefined ? { userCount } : {}),
    };
  }

  async saveOutletFeatures(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    contextOutletId: string,
    targetOutletId: string,
    input: OutletFeatureUpdateInput,
  ) {
    await this.requirePermission(database, tenantId, userId, contextOutletId, "access_control.features.manage");
    await this.requireOutlet(database, tenantId, userId, targetOutletId);
    const requestedKeys = uniqueStrings(input.enabledFeatureKeys);
    const allowedKeys = new Set(OUTLET_FEATURE_KEYS);
    if (requestedKeys.some((key) => !allowedKeys.has(key))) {
      throw new AppError(400, "Unknown outlet feature key", "INVALID_FEATURE_KEY");
    }
    const normalized = normalizeFeatureKeys(requestedKeys);
    const before = await this.repository.getFeatureAccess(database, tenantId, targetOutletId);
    const result = await this.repository.saveFeatureAccess(
      database, tenantId, targetOutletId, normalized, input.expectedRevision, userId,
    );
    await this.repository.writeAudit(
      database, tenantId, userId, "OUTLET_FEATURES_UPDATED", "outlet_features", targetOutletId, contextOutletId, before, result,
    );
    return result;
  }
}

export const postgresAccessControlService = new PostgresAccessControlService();
