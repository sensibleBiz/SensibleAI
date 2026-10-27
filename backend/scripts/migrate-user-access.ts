import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "../src/config/firebase.js";

// Dry run one profile:
// npm run migrate:user-access -- --profile-id=<document-or-profile-id>
// Add --write to migrate it, or omit --profile-id to process the collection.

type OutletAccess = {
  outletId: string;
  role?: string;
  departmentAccessList?: string[];
  outletPermissions?: string[];
};

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");
const profileId = args
  .find((argument) => argument.startsWith("--profile-id="))
  ?.slice("--profile-id=".length)
  .trim();

const db = firestore;
const profiles = db.collection("USER_PROFILE");

const uniqueStrings = (value: unknown, transform?: (item: string) => string) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
            .map((item) => transform?.(item) ?? item),
        ),
      )
    : [];

const normalizeRole = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

const isSuperAdmin = (value: unknown) =>
  normalizeRole(value).replaceAll("_", "") === "SUPERADMIN";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const consolidateAccess = (
  profile: FirebaseFirestore.DocumentData,
): OutletAccess[] => {
  const byOutlet = new Map<string, OutletAccess>();

  if (Array.isArray(profile.permissions)) {
    profile.permissions.forEach((rawPermission: unknown) => {
      const permission = asRecord(rawPermission);
      const outletId = String(permission?.outletId ?? "").trim();
      if (!outletId || !permission) return;

      const current = byOutlet.get(outletId) ?? { outletId };
      const role = normalizeRole(permission.role);
      const hasDepartments = Array.isArray(permission.departmentAccessList);
      const hasPermissions = Array.isArray(permission.outletPermissions);

      byOutlet.set(outletId, {
        ...current,
        ...(role ? { role } : {}),
        ...(hasDepartments
          ? {
              departmentAccessList: uniqueStrings(
                permission.departmentAccessList,
                (item) => item.toUpperCase(),
              ),
            }
          : {}),
        ...(hasPermissions
          ? {
              outletPermissions: uniqueStrings([
                ...(current.outletPermissions ?? []),
                ...(permission.outletPermissions as unknown[]),
              ]),
            }
          : {}),
      });
    });
  }

  if (Array.isArray(profile.outletRoles)) {
    profile.outletRoles.forEach((rawOutletRole: unknown) => {
      const outletRole = asRecord(rawOutletRole);
      const outletId = String(outletRole?.outletId ?? "").trim();
      if (!outletId || !outletRole) return;

      const current = byOutlet.get(outletId) ?? { outletId };
      const role = normalizeRole(outletRole.role);
      byOutlet.set(outletId, {
        ...current,
        ...(!current.role && role ? { role } : {}),
        ...(!Array.isArray(current.departmentAccessList) &&
        Array.isArray(outletRole.departmentAccessList)
          ? {
              departmentAccessList: uniqueStrings(
                outletRole.departmentAccessList,
                (item) => item.toUpperCase(),
              ),
            }
          : {}),
      });
    });
  }

  const primaryOutletId = String(
    profile.outletId ??
      (Array.isArray(profile.outlets) ? profile.outlets[0] : "") ??
      "",
  ).trim();
  const outletIds = uniqueStrings([
    ...(Array.isArray(profile.outlets) ? profile.outlets : []),
    ...(primaryOutletId ? [primaryOutletId] : []),
    ...byOutlet.keys(),
  ]);
  const legacyRole = normalizeRole(profile.role);

  outletIds.forEach((outletId) => {
    const current = byOutlet.get(outletId) ?? { outletId };
    const inheritedRole =
      current.role ||
      (legacyRole
        ? isSuperAdmin(legacyRole) &&
          primaryOutletId &&
          outletId !== primaryOutletId
          ? "SUB_SUPER_ADMIN"
          : legacyRole
        : "");

    byOutlet.set(outletId, {
      ...current,
      ...(inheritedRole ? { role: inheritedRole } : {}),
      ...(!Array.isArray(current.departmentAccessList) &&
      Array.isArray(profile.departmentAccessList)
        ? {
            departmentAccessList: uniqueStrings(
              profile.departmentAccessList,
              (item) => item.toUpperCase(),
            ),
          }
        : {}),
    });
  });

  return Array.from(byOutlet.values());
};

let documents: FirebaseFirestore.QueryDocumentSnapshot[] = [];
if (profileId) {
  const directDocument = await profiles.doc(profileId).get();
  if (directDocument.exists) {
    documents = [
      directDocument as FirebaseFirestore.QueryDocumentSnapshot,
    ];
  } else {
    documents = (await profiles.where("id", "==", profileId).get()).docs;
  }
} else {
  documents = (await profiles.get()).docs;
}

let checked = 0;
let migrated = 0;
let skipped = 0;
let batch = db.batch();
let writesInBatch = 0;

const commitBatch = async () => {
  if (!shouldWrite || writesInBatch === 0) return;
  await batch.commit();
  batch = db.batch();
  writesInBatch = 0;
};

for (const document of documents) {
  checked += 1;
  const profile = document.data();
  const permissions = consolidateAccess(profile);

  if (permissions.length === 0 && profile.role) {
    skipped += 1;
    console.warn(
      `Skipped ${document.id}: a role exists but no outlet could be resolved.`,
    );
    continue;
  }

  const hasLegacyFields = [
    "outletRoles",
    "departmentAccessList",
    "permissionList",
  ].some((field) => Object.prototype.hasOwnProperty.call(profile, field));
  const permissionsChanged =
    JSON.stringify(profile.permissions ?? []) !== JSON.stringify(permissions);

  if (!hasLegacyFields && !permissionsChanged) continue;

  migrated += 1;
  console.log(`${shouldWrite ? "Migrating" : "Would migrate"} ${document.id}`);

  if (shouldWrite) {
    batch.update(document.ref, {
      permissions,
      outletRoles: FieldValue.delete(),
      departmentAccessList: FieldValue.delete(),
      permissionList: FieldValue.delete(),
    });
    writesInBatch += 1;
    if (writesInBatch === 400) await commitBatch();
  }
}

await commitBatch();
console.log(
  `${shouldWrite ? "Migration" : "Dry run"} complete: ${checked} checked, ${migrated} ${
    shouldWrite ? "migrated" : "to migrate"
  }, ${skipped} skipped.`,
);
