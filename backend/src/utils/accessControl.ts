import type {
  AuthorizedUserProfile,
  OutletPermissions,
} from "../types/auth.types.js";

export const normalizeRole = (role?: string) =>
  String(role ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

export const normalizeRoleForStorage = (role?: string) => {
  const normalized = String(role ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const knownRoles: Record<string, string> = {
    SUPERADMIN: "SUPER_ADMIN",
    SUBSUPERADMIN: "SUB_SUPER_ADMIN",
  };
  return knownRoles[normalizeRole(normalized)] ?? normalized;
};

export const uniqueStrings = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item ?? "").trim())
            .filter(Boolean),
        ),
      )
    : [];

export const normalizeDepartment = (department?: string) =>
  String(department ?? "").trim().toUpperCase();

export const getOutletRole = (
  profile: AuthorizedUserProfile,
  outletId: string,
) => {
  const consolidatedRole = profile.permissions?.find(
    (entry) => entry.outletId === outletId,
  )?.role;
  if (consolidatedRole) return normalizeRole(consolidatedRole);

  const legacyRole = profile.outletRoles?.find(
    (outletRole) => outletRole.outletId === outletId,
  )?.role;
  if (legacyRole) return normalizeRole(legacyRole);

  if (normalizeRole(profile.role) === "SUPERADMIN") {
    const primaryOutletId = profile.outletId ?? profile.outlets?.[0];
    if (primaryOutletId && primaryOutletId !== outletId) return "SUBSUPERADMIN";
  }

  return normalizeRole(profile.role);
};

export const canAccessOutlet = (
  profile: AuthorizedUserProfile,
  outletId: string,
) =>
  profile.outletId === outletId ||
  profile.outlets?.includes(outletId) === true ||
  profile.permissions?.some((entry) => entry.outletId === outletId) === true ||
  profile.outletRoles?.some((outletRole) => outletRole.outletId === outletId) ===
    true;

export const hasOutletPermission = (
  profile: AuthorizedUserProfile,
  outletId: string,
  permission: string,
) => {
  const role = getOutletRole(profile, outletId);
  if (role === "SUPERADMIN") return true;

  const outletPermissions = profile.permissions?.find(
    (entry) => entry.outletId === outletId,
  );
  if (
    role === "SUBSUPERADMIN" &&
    !Array.isArray(outletPermissions?.outletPermissions)
  ) {
    return true;
  }

  return outletPermissions?.outletPermissions?.includes(permission) === true;
};

export const getDepartmentAccess = (
  profile: AuthorizedUserProfile,
  outletId: string,
) => {
  const canonical = profile.permissions?.find(
    (entry) => entry.outletId === outletId,
  )?.departmentAccessList;
  if (Array.isArray(canonical)) {
    return uniqueStrings(canonical).map(normalizeDepartment);
  }

  const legacy = profile.outletRoles?.find(
    (entry) => entry.outletId === outletId,
  )?.departmentAccessList;
  if (Array.isArray(legacy)) {
    return uniqueStrings(legacy).map(normalizeDepartment);
  }

  return uniqueStrings(profile.departmentAccessList).map(normalizeDepartment);
};

export const consolidateOutletAccess = (
  profile: AuthorizedUserProfile,
): OutletPermissions[] => {
  const byOutlet = new Map<string, OutletPermissions>();

  (profile.permissions ?? []).forEach((entry) => {
    const outletId = String(entry.outletId ?? "").trim();
    if (!outletId) return;
    byOutlet.set(outletId, {
      outletId,
      ...(entry.role ? { role: String(entry.role).trim() } : {}),
      ...(Array.isArray(entry.departmentAccessList)
        ? {
            departmentAccessList: uniqueStrings(entry.departmentAccessList).map(
              normalizeDepartment,
            ),
          }
        : {}),
      ...(Array.isArray(entry.outletPermissions)
        ? { outletPermissions: uniqueStrings(entry.outletPermissions) }
        : {}),
    });
  });

  (profile.outletRoles ?? []).forEach((entry) => {
    const outletId = String(entry.outletId ?? "").trim();
    if (!outletId) return;
    const current = byOutlet.get(outletId) ?? { outletId };
    byOutlet.set(outletId, {
      ...current,
      ...(!current.role && entry.role ? { role: entry.role } : {}),
      ...(!current.departmentAccessList && entry.departmentAccessList
        ? {
            departmentAccessList: uniqueStrings(entry.departmentAccessList).map(
              normalizeDepartment,
            ),
          }
        : {}),
    });
  });

  const primaryOutletId = profile.outletId ?? profile.outlets?.[0];
  const outletIds = uniqueStrings([
    ...(profile.outlets ?? []),
    ...(primaryOutletId ? [primaryOutletId] : []),
    ...byOutlet.keys(),
  ]);
  outletIds.forEach((outletId) => {
    const current = byOutlet.get(outletId) ?? { outletId };
    const inheritedRole = current.role
      ? current.role
      : normalizeRole(profile.role) === "SUPERADMIN" &&
          primaryOutletId &&
          outletId !== primaryOutletId
        ? "SUB_SUPER_ADMIN"
        : profile.role;
    byOutlet.set(outletId, {
      ...current,
      ...(inheritedRole ? { role: inheritedRole } : {}),
      ...(!current.departmentAccessList && profile.departmentAccessList
        ? {
            departmentAccessList: uniqueStrings(
              profile.departmentAccessList,
            ).map(normalizeDepartment),
          }
        : {}),
    });
  });

  return [...byOutlet.values()];
};
