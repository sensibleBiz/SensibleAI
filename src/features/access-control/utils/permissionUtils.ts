import { ROLES } from "@/shared/lib/constants";
import { normalizeRole, normalizeRoleForStorage } from "@/shared/lib/roleUtils";
export { normalizeRoleForStorage } from "@/shared/lib/roleUtils";
import type {
  OutletPermissions,
  UserProfile,
} from "@/features/auth";

export const DEFAULT_PERMISSION_DEPARTMENTS = [
  "SALES",
  "IT",
  "SUPPORT",
  "HR",
  "ACCOUNT",
  "HARDWARE",
];

export const isRoleMatch = (actualRole?: string, expectedRole?: string) =>
  Boolean(expectedRole) && normalizeRole(actualRole) === normalizeRole(expectedRole);

export const isSuperAdminRole = (role?: string) =>
  isRoleMatch(role, ROLES.SUPER_ADMIN);

export const isSubSuperAdminRole = (role?: string) =>
  isRoleMatch(role, ROLES.SUB_SUPER_ADMIN);

export const formatRoleLabel = (role?: string) =>
  String(role ?? "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

type OutletRoleUser = Pick<
  UserProfile,
  | "role"
  | "outletId"
  | "outlets"
  | "outletRoles"
  | "permissions"
  | "departmentAccessList"
>;

const uniqueStrings = (values: unknown) =>
  Array.isArray(values)
    ? Array.from(
        new Set(
          values
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
        )
      )
    : [];

export const getUserOutletAccess = (
  user?: Partial<OutletRoleUser> | null,
  outletId?: string
) => consolidateUserPermissions(user).find((entry) => entry.outletId === outletId);

/**
 * Resolve the user's role for the active outlet.
 *
 * Legacy SUPER_ADMIN profiles are treated as the owner of only their primary
 * outlet. Their other assigned outlets receive the customizable
 * SUB_SUPER_ADMIN role until an explicit outlet role is saved.
 */
export const getUserOutletRole = (
  user?: Partial<OutletRoleUser> | null,
  outletId?: string
) => {
  if (!user) return undefined;
  if (!outletId) {
    const normalizedRole = normalizeRoleForStorage(user.role);
    return normalizedRole || undefined;
  }

  const consolidatedRole = getUserOutletAccess(user, outletId)?.role;
  if (consolidatedRole) return normalizeRoleForStorage(consolidatedRole);

  const legacyRole = user.outletRoles?.find(
    (outletRole) => outletRole?.outletId === outletId
  )?.role;

  if (legacyRole) return normalizeRoleForStorage(legacyRole);

  if (isSuperAdminRole(user.role)) {
    const primaryOutletId = user.outletId || user.outlets?.[0];
    if (primaryOutletId && primaryOutletId !== outletId) {
      return ROLES.SUB_SUPER_ADMIN;
    }
  }

  const normalizedRole = normalizeRoleForStorage(user.role);
  return normalizedRole || undefined;
};

export const isUserSuperAdminForOutlet = (
  user?: Partial<OutletRoleUser> | null,
  outletId?: string
) => isSuperAdminRole(getUserOutletRole(user, outletId));

export const getUserOutletDepartmentAccess = (
  user?: Partial<OutletRoleUser> & { departmentAccessList?: string[] },
  outletId?: string
) => {
  const consolidatedDepartmentAccess = getUserOutletAccess(
    user,
    outletId
  )?.departmentAccessList;

  if (Array.isArray(consolidatedDepartmentAccess)) {
    return consolidatedDepartmentAccess;
  }

  const legacyDepartmentAccess = user?.outletRoles?.find(
    (outletRole) => outletRole?.outletId === outletId
  )?.departmentAccessList;

  return Array.isArray(legacyDepartmentAccess)
    ? legacyDepartmentAccess
    : user?.departmentAccessList ?? [];
};

/**
 * Convert split/legacy access fields into one canonical entry per outlet.
 * Explicit empty permission arrays are retained because they mean "no grants".
 */
export function consolidateUserPermissions(
  user?: Partial<OutletRoleUser> | null
): OutletPermissions[] {
  if (!user) return [];

  const byOutlet = new Map<string, OutletPermissions>();

  (user.permissions ?? []).forEach((permission) => {
    const outletId = String(permission?.outletId ?? "").trim();
    if (!outletId) return;

    const current = byOutlet.get(outletId) ?? { outletId };
    const hasExplicitPermissions = Array.isArray(permission.outletPermissions);
    const mergedPermissions = hasExplicitPermissions
      ? uniqueStrings([
          ...(current.outletPermissions ?? []),
          ...permission.outletPermissions!,
        ])
      : current.outletPermissions;

    byOutlet.set(outletId, {
      ...current,
      ...(permission.role
        ? { role: normalizeRoleForStorage(permission.role) }
        : {}),
      ...(Array.isArray(permission.departmentAccessList)
        ? {
            departmentAccessList: uniqueStrings(
              permission.departmentAccessList
            ).map(normalizeDepartmentAccess),
          }
        : {}),
      ...(mergedPermissions !== undefined
        ? { outletPermissions: mergedPermissions }
        : {}),
    });
  });

  (user.outletRoles ?? []).forEach((outletRole) => {
    const outletId = String(outletRole?.outletId ?? "").trim();
    if (!outletId) return;

    const current = byOutlet.get(outletId) ?? { outletId };
    byOutlet.set(outletId, {
      ...current,
      ...(!current.role && outletRole.role
        ? { role: normalizeRoleForStorage(outletRole.role) }
        : {}),
      ...(!Array.isArray(current.departmentAccessList) &&
      Array.isArray(outletRole.departmentAccessList)
        ? {
            departmentAccessList: uniqueStrings(
              outletRole.departmentAccessList
            ).map(normalizeDepartmentAccess),
          }
        : {}),
    });
  });

  const primaryOutletId = user.outletId || user.outlets?.[0];
  const outletIds = uniqueStrings([
    ...(user.outlets ?? []),
    ...(primaryOutletId ? [primaryOutletId] : []),
    ...byOutlet.keys(),
  ]);

  outletIds.forEach((outletId) => {
    const current = byOutlet.get(outletId) ?? { outletId };
    let inheritedRole = current.role;

    if (!inheritedRole && user.role) {
      inheritedRole =
        isSuperAdminRole(user.role) &&
        primaryOutletId &&
        outletId !== primaryOutletId
          ? ROLES.SUB_SUPER_ADMIN
          : normalizeRoleForStorage(user.role);
    }

    byOutlet.set(outletId, {
      ...current,
      ...(inheritedRole
        ? { role: normalizeRoleForStorage(inheritedRole) }
        : {}),
      ...(!Array.isArray(current.departmentAccessList) &&
      Array.isArray(user.departmentAccessList)
        ? {
            departmentAccessList: uniqueStrings(
              user.departmentAccessList
            ).map(normalizeDepartmentAccess),
          }
        : {}),
    });
  });

  return Array.from(byOutlet.values());
}

export const upsertOutletAccess = (
  permissions: OutletPermissions[],
  access: OutletPermissions
) => [
  ...permissions.filter((entry) => entry.outletId !== access.outletId),
  {
    outletId: access.outletId.trim(),
    ...(access.role
      ? { role: normalizeRoleForStorage(access.role) }
      : {}),
    ...(Array.isArray(access.departmentAccessList)
      ? {
          departmentAccessList: uniqueStrings(
            access.departmentAccessList
          ).map(normalizeDepartmentAccess),
        }
      : {}),
    ...(Array.isArray(access.outletPermissions)
      ? { outletPermissions: uniqueStrings(access.outletPermissions) }
      : {}),
  },
];

export const normalizeDepartmentAccess = (department?: string) =>
  String(department ?? "").trim().toUpperCase();

export const formatDepartmentAccessLabel = (department?: string) => {
  const normalized = normalizeDepartmentAccess(department);

  if (["IT", "HR"].includes(normalized)) {
    return normalized;
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
};
