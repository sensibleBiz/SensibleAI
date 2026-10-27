import { ROLES } from "./constants";

export const normalizeRole = (role?: string) =>
  String(role ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

/** Canonical database representation for both built-in and custom roles. */
export const normalizeRoleForStorage = (role?: string) => {
  const rawRole = String(role ?? "").trim();
  if (!rawRole) return "";

  const knownRole = Object.values(ROLES).find(
    (candidate) => normalizeRole(candidate) === normalizeRole(rawRole)
  );
  if (knownRole) return knownRole;

  return rawRole
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
};

