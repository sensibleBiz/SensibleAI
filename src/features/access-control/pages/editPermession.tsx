import { useState, useMemo, useEffect } from "react";
import {
  Alert,
  Avatar,
  Input,
  Card,
  Select,
  Checkbox,
  Button,
  Tag,
  Progress,
  theme,
  Row,
  Col,
  Spin,
  Empty,
} from "antd";
import { ArrowLeftOutlined, SaveOutlined } from "@ant-design/icons";
import {
  BadgeCheck,
  Building2,
  KeyRound,
  LockKeyhole,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  APP_MESSAGES,
  DEFAULT_PERMISSION_MASTER,
  isInternalAdminOutlet,
  PERMISSION_MASTER,
  ROLES,
  ROUTES_PATHS,
} from "@/shared/lib/constants";
import { useMessageApi } from "@/shared/hooks";
import { PermissionDTO } from "../types/types";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { DEFAULT_PERMISSION_DEPARTMENTS, formatDepartmentAccessLabel, formatRoleLabel, getUserOutletDepartmentAccess, getUserOutletAccess, getUserOutletRole, isRoleMatch, isSubSuperAdminRole, isSuperAdminRole, normalizeDepartmentAccess } from "../utils/permissionUtils";
import { useOutletFeatureAccess } from "@/features/outlets";
import { getOutletFeatureKeysForPermission } from "@/features/outlets";
import { usePermission } from "../hooks/usePermission";
import {
  getSidebarPermissionLocation,
  SIDEBAR_PERMISSION_KEYS,
  SIDEBAR_PERMISSION_SECTION_RULES,
} from "@/shared/lib/sidebarMenuConfig";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { accessControlApi, type PermissionUser } from "../api/accessControlApi";

const permissionSectionOrder = new Map<string, number>(
  SIDEBAR_PERMISSION_SECTION_RULES.map((section, index) => [
    section.sectionLabel,
    index,
  ])
);

const permissionSubmoduleOrder = new Map<string, number>(
  SIDEBAR_PERMISSION_SECTION_RULES.map((section, index) => [
    `${section.sectionLabel}\u0000${section.submoduleLabel}`,
    index,
  ])
);

const PERMISSION_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const normalizePermissionKey = (value: unknown): string | null => {
  const permissionKey = String(value ?? "").trim().toUpperCase();
  return PERMISSION_KEY_PATTERN.test(permissionKey) ? permissionKey : null;
};

const normalizePermissionKeys = (values: readonly unknown[]): string[] =>
  Array.from(
    new Set(
      values
        .map(normalizePermissionKey)
        .filter((permissionKey): permissionKey is string => Boolean(permissionKey)),
    ),
  );

export default function EditPermissionsPage() {
  const { id } = useParams<{ id: string }>();
  const userId = id as string;
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [user, setUser] = useState<PermissionUser>();
  const [permissionMaster, setPermissionMaster] = useState<PermissionDTO[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedDepartmentAccess, setSelectedDepartmentAccess] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>();
  const [verified, setVerified] = useState<boolean>(false);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [permissionSearch, setPermissionSearch] = useState("");
  const messageApi = useMessageApi();
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const authMode = useSelector((state: RootState) => state.auth.authMode);
  const {
    currentRole,
    hasPermission,
    isSuperAdmin: hasSuperAdminAccess,
  } = usePermission();
  const {
    enabledFeatureKeys,
    isFeatureAccessConfigured,
    loadingModuleSubscriptions,
  } = useOutletFeatureAccess();

  const departmentOptions = useMemo(() => {
    const departments = new Set(DEFAULT_PERMISSION_DEPARTMENTS);

    availableDepartments.forEach((department) => {
      const normalized = normalizeDepartmentAccess(department);
      if (normalized) departments.add(normalized);
    });

    return Array.from(departments)
      .sort()
      .map((department) => ({
        label: formatDepartmentAccessLabel(department),
        value: department,
      }));
  }, [availableDepartments]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const fetchUser = async () => {
      try {
        setPermissionLoading(true);
        if (!outletId || !userId) return;
        const detail = await accessControlApi.getUser(
          outletId,
          userId,
          controller.signal,
          authMode ?? undefined,
        );
        const pmdata = detail.permissionMaster;
        const permissionByKey = new Map<string, PermissionDTO>();
        if (authMode !== "postgres") {
          normalizePermissionKeys(Object.values(PERMISSION_MASTER)).forEach((permissionKey) => {
            permissionByKey.set(permissionKey, {
              key: permissionKey,
              label: formatPermissionKeyLabel(permissionKey),
              description: `Allow ${formatPermissionKeyLabel(
                permissionKey
              ).toLowerCase()}`,
              category: "Other",
            });
          });
          normalizePermissionKeys(SIDEBAR_PERMISSION_KEYS).forEach((permissionKey) => {
            permissionByKey.set(permissionKey, {
              key: permissionKey,
              label: formatPermissionKeyLabel(permissionKey),
              description: `Allow ${formatPermissionKeyLabel(
                permissionKey
              ).toLowerCase()}`,
              category: "Other",
            });
          });
          DEFAULT_PERMISSION_MASTER.forEach((permission) => {
            const permissionKey = normalizePermissionKey(permission.key);
            if (permissionKey) {
              permissionByKey.set(permissionKey, { ...permission, key: permissionKey });
            }
          });
        }
        ((pmdata as PermissionDTO[]) ?? []).forEach((permission) => {
          const permissionKey = normalizePermissionKey(permission.key);
          if (permissionKey) {
            permissionByKey.set(permissionKey, { ...permission, key: permissionKey });
          }
        });
        const mergedPermissionMaster = Array.from(permissionByKey.values());
        setPermissionMaster(mergedPermissionMaster);
        setPermissionLoading(false);
        const fetchedUser = detail.user;

        if (!fetchedUser) {
          setUser(undefined);
          return;
        }

        setVerified(fetchedUser.verified);
        setAvailableDepartments(detail.departments);

        setUser(fetchedUser);
        const fetchedUserRole = getUserOutletRole(fetchedUser, outletId);
        const outletAccess = getUserOutletAccess(fetchedUser, outletId);
        const hasDefaultSubSuperAdminAccess =
          isSubSuperAdminRole(fetchedUserRole) &&
          !Array.isArray(outletAccess?.outletPermissions);
        setSelectedPermissions(
          isSuperAdminRole(fetchedUserRole) ||
            hasDefaultSubSuperAdminAccess
            ? mergedPermissionMaster.map((permission) => permission.key)
            : normalizePermissionKeys(outletAccess?.outletPermissions ?? [])
        );
        setSelectedDepartmentAccess(
          isSuperAdminRole(fetchedUserRole) ||
            hasDefaultSubSuperAdminAccess
            ? detail.departments.map(normalizeDepartmentAccess).filter(Boolean)
            : getUserOutletDepartmentAccess(fetchedUser, outletId)
                .map(normalizeDepartmentAccess)
                .filter(Boolean)
        );

        setSelectedRole(fetchedUserRole);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Unexpected error:", error);
        messageApi.error(
          error instanceof Error ? error.message : "Failed to load user access",
        );
      } finally {
        if (!controller.signal.aborted) {
          setPermissionLoading(false);
          setLoading(false);
        }
      }
    };
    void fetchUser();
    return () => controller.abort();
  }, [authMode, messageApi, outletId, userId]);

  const enabledFeatureKeySet = useMemo(
    () => new Set(enabledFeatureKeys),
    [enabledFeatureKeys]
  );
  const outletPermissionMaster = useMemo(
    () => {
      if (isInternalAdminOutlet(outletId)) {
        return permissionMaster;
      }

      return permissionMaster.filter((permission) => {
        const featureKeys = getOutletFeatureKeysForPermission(permission);
        return featureKeys.some((featureKey) =>
          enabledFeatureKeySet.has(featureKey)
        );
      });
    },
    [enabledFeatureKeySet, outletId, permissionMaster]
  );
  const permissionsBySection = useMemo(() => {
    const grouped = new Map<string, Map<string, PermissionDTO[]>>();

    outletPermissionMaster.forEach((perm) => {
      const location = getPermissionLocation(perm);
      let submodules = grouped.get(location.sectionLabel);
      if (!submodules) {
        submodules = new Map<string, PermissionDTO[]>();
        grouped.set(location.sectionLabel, submodules);
      }

      const permissions = submodules.get(location.submoduleLabel) ?? [];
      permissions.push(perm);
      submodules.set(location.submoduleLabel, permissions);
    });

    return Array.from(grouped.entries())
      .sort(([firstSection], [secondSection]) => {
        const firstIndex =
          permissionSectionOrder.get(firstSection) ??
          SIDEBAR_PERMISSION_SECTION_RULES.length;
        const secondIndex =
          permissionSectionOrder.get(secondSection) ??
          SIDEBAR_PERMISSION_SECTION_RULES.length;

        return firstIndex - secondIndex || firstSection.localeCompare(secondSection);
      })
      .map(([sectionLabel, submoduleMap]) => ({
        sectionLabel,
        submodules: Array.from(submoduleMap.entries())
          .sort(([firstSubmodule], [secondSubmodule]) => {
            const firstIndex =
              permissionSubmoduleOrder.get(
                `${sectionLabel}\u0000${firstSubmodule}`
              ) ?? SIDEBAR_PERMISSION_SECTION_RULES.length;
            const secondIndex =
              permissionSubmoduleOrder.get(
                `${sectionLabel}\u0000${secondSubmodule}`
              ) ?? SIDEBAR_PERMISSION_SECTION_RULES.length;

            return (
              firstIndex - secondIndex ||
              firstSubmodule.localeCompare(secondSubmodule)
            );
          })
          .map(([submoduleLabel, permissions]) => ({
            submoduleLabel,
            permissions,
          })),
      }));
  }, [outletPermissionMaster]);
  const filteredPermissionGroups = useMemo(() => {
    const normalizedSearch = permissionSearch.trim().toLowerCase();

    return permissionsBySection
      .map((section) => {
        const sectionMatches = section.sectionLabel
          .toLowerCase()
          .includes(normalizedSearch);
        const submodules = section.submodules
          .map((submodule) => {
            if (!normalizedSearch || sectionMatches) return submodule;

            const submoduleMatches = submodule.submoduleLabel
              .toLowerCase()
              .includes(normalizedSearch);
            const permissions = submoduleMatches
              ? submodule.permissions
              : submodule.permissions.filter((permission) =>
                  [permission.key, permission.label, permission.description]
                    .map((value) => String(value ?? "").toLowerCase())
                    .some((value) => value.includes(normalizedSearch))
                );

            return { ...submodule, permissions };
          })
          .filter((submodule) => submodule.permissions.length > 0);

        return { ...section, submodules };
      })
      .filter((section) => section.submodules.length > 0);
  }, [permissionSearch, permissionsBySection]);
  const matchingPermissionCount = useMemo(
    () =>
      filteredPermissionGroups.reduce(
        (total, section) =>
          total +
          section.submodules.reduce(
            (sectionTotal, submodule) =>
              sectionTotal + submodule.permissions.length,
            0
          ),
        0
      ),
    [filteredPermissionGroups]
  );

  const allPermissionKeys = useMemo(
    () => outletPermissionMaster.map((permission) => permission.key),
    [outletPermissionMaster]
  );
  const fullPermissionKeys = useMemo(
    () => permissionMaster.map((permission) => permission.key),
    [permissionMaster]
  );
  const disabledModulePermissionCount = Math.max(
    0,
    permissionMaster.length - outletPermissionMaster.length
  );
  const allPermissionKeySet = useMemo(
    () => new Set(allPermissionKeys),
    [allPermissionKeys]
  );
  const allDepartmentKeys = useMemo(
    () => departmentOptions.map((department) => department.value),
    [departmentOptions]
  );
  const currentUserIsSuperAdmin = hasSuperAdminAccess;
  const currentUserIsAdmin = isRoleMatch(currentRole, ROLES.ADMIN);
  const currentUserIsSubSuperAdmin = isSubSuperAdminRole(currentRole);
  const currentUserAllowedDepartments = getUserOutletDepartmentAccess(
    currentUser ?? undefined,
    outletId
  )
    .map(normalizeDepartmentAccess)
    .filter(Boolean);
  const currentUserCanManagePermissions =
    currentUserIsSuperAdmin ||
    currentUserIsAdmin ||
    (currentUserIsSubSuperAdmin &&
      hasPermission(PERMISSION_MASTER.CRM_PERMISSION_EDIT));
  const targetUserIsSuperAdmin = isSuperAdminRole(selectedRole);
  const targetUserIsSubSuperAdmin = isSubSuperAdminRole(selectedRole);
  const targetUserIsAdmin = isRoleMatch(selectedRole, ROLES.ADMIN);
  const targetUserDepartment = normalizeDepartmentAccess(user?.department);
  const targetUserInManagedDepartment =
    currentUserIsSuperAdmin ||
    (currentUserIsSubSuperAdmin &&
      currentUserAllowedDepartments.length === 0) ||
    ((currentUserIsAdmin || currentUserIsSubSuperAdmin) &&
      Boolean(targetUserDepartment) &&
      currentUserAllowedDepartments.includes(targetUserDepartment));
  const currentUserCanManageTarget =
    currentUserCanManagePermissions &&
    (!targetUserIsSubSuperAdmin || currentUserIsSuperAdmin);
  const permissionEditingDisabled =
    !currentUserCanManageTarget ||
    targetUserIsSuperAdmin ||
    !targetUserInManagedDepartment;
  const departmentAccessEditingDisabled =
    !currentUserIsSuperAdmin || targetUserIsSuperAdmin;
  const effectiveSelectedPermissions = targetUserIsSuperAdmin
    ? allPermissionKeys
    : selectedPermissions;
  const visibleSelectedPermissions = effectiveSelectedPermissions.filter(
    (permissionKey) => allPermissionKeySet.has(permissionKey)
  );
  const selectedPermissionKeySet = new Set(visibleSelectedPermissions);
  const selectedPermissionPercentage = allPermissionKeys.length
    ? Math.round(
        (visibleSelectedPermissions.length / allPermissionKeys.length) * 100
      )
    : 0;
  const effectiveDepartmentAccess = targetUserIsSuperAdmin
    ? allDepartmentKeys
    : selectedDepartmentAccess;
  const showDepartmentAccess =
    targetUserIsAdmin ||
    targetUserIsSubSuperAdmin ||
    targetUserIsSuperAdmin;
  const permissionEditBlockedMessage = targetUserIsSuperAdmin
    ? "Super Admin permissions cannot be changed"
    : targetUserIsSubSuperAdmin && !currentUserIsSuperAdmin
      ? "Only the outlet Super Admin can change Sub-Super Admin access"
    : !targetUserInManagedDepartment
      ? "You can only change permissions for assigned departments"
      : "Only Super Admin or Admin can change permissions";

  if (loading || permissionLoading || loadingModuleSubscriptions) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", marginTop: 100 }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <div style={{ textAlign: "center", color: token.colorTextSecondary }}>
            <Empty description=" User not found" />
          </div>
        </Card>
      </div>
    );
  }

  const handleRoleChange = (newRole: string) => {
    if (!currentUserIsSuperAdmin || targetUserIsSuperAdmin) {
      return;
    }

    setSelectedRole(newRole);
    if (isSubSuperAdminRole(newRole)) {
      setSelectedPermissions(fullPermissionKeys);
      setSelectedDepartmentAccess(allDepartmentKeys);
    } else if (!isRoleMatch(newRole, ROLES.ADMIN)) {
      setSelectedDepartmentAccess([]);
    }
  };

  const handlePermissionToggle = (permissionKey: string, checked: boolean) => {
    if (permissionEditingDisabled) {
      messageApi.warning(permissionEditBlockedMessage);
      return;
    }

    const normalizedPermissionKey = normalizePermissionKey(permissionKey);
    if (!normalizedPermissionKey) {
      messageApi.error("Invalid permission key. Refresh the page and try again.");
      return;
    }

    if (checked) {
      messageApi.success(`Permission Added ${normalizedPermissionKey}`, 0.5);
      setSelectedPermissions((previous) =>
        previous.includes(normalizedPermissionKey)
          ? previous
          : [...previous, normalizedPermissionKey]
      );
    } else {
      messageApi.warning(`Permission Removed ${normalizedPermissionKey}`, 0.5);
      setSelectedPermissions(
        selectedPermissions?.filter((p) => p !== normalizedPermissionKey)
      );
    }
  };

  const handleSelectAllPermissions = () => {
    if (permissionEditingDisabled) {
      messageApi.warning(permissionEditBlockedMessage);
      return;
    }

    setSelectedPermissions((currentPermissions) =>
      Array.from(new Set([...currentPermissions, ...allPermissionKeys]))
    );
    messageApi.success("All available permissions selected", 0.8);
  };

  const handleClearPermissions = () => {
    if (permissionEditingDisabled) {
      messageApi.warning(permissionEditBlockedMessage);
      return;
    }

    setSelectedPermissions((currentPermissions) =>
      currentPermissions.filter(
        (permissionKey) => !allPermissionKeySet.has(permissionKey)
      )
    );
    messageApi.success("Available permissions cleared", 0.8);
  };

  const handleSelectPermissionSection = (
    permissionKeys: string[],
    section: string
  ) => {
    if (permissionEditingDisabled) {
      messageApi.warning(permissionEditBlockedMessage);
      return;
    }

    setSelectedPermissions((currentPermissions) =>
      Array.from(new Set([...currentPermissions, ...permissionKeys]))
    );
    messageApi.success(`${section} permissions selected`, 0.8);
  };

  const handleClearPermissionSection = (
    permissionKeys: string[],
    section: string
  ) => {
    if (permissionEditingDisabled) {
      messageApi.warning(permissionEditBlockedMessage);
      return;
    }

    const sectionPermissionKeySet = new Set(permissionKeys);
    setSelectedPermissions((currentPermissions) =>
      currentPermissions.filter(
        (permissionKey) => !sectionPermissionKeySet.has(permissionKey)
      )
    );
    messageApi.success(`${section} permissions cleared`, 0.8);
  };

  const handleDepartmentAccessChange = (departments: string[]) => {
    if (departmentAccessEditingDisabled) {
      messageApi.warning(
        targetUserIsSuperAdmin
          ? "Super Admin department access cannot be changed"
          : "Only Super Admin can change department access"
      );
      return;
    }

    setSelectedDepartmentAccess(
      departments.map(normalizeDepartmentAccess).filter(Boolean)
    );
  };

  const handleSave = async () => {
    if (!outletId) {
      messageApi.error("Outlet not selected");
      return;
    }

    if (!currentUserCanManageTarget) {
      messageApi.error(
        targetUserIsSubSuperAdmin
          ? "Only the outlet Super Admin can change Sub-Super Admin access"
          : "You do not have permission to change this user's access"
      );
      return;
    }

    if (targetUserIsSuperAdmin || !targetUserInManagedDepartment) {
      messageApi.warning(permissionEditBlockedMessage);
      return;
    }

    try {
      setSaveLoading(true);
      const validSelectedPermissions = normalizePermissionKeys(selectedPermissions);
      const removedInvalidPermissionCount =
        selectedPermissions.length - validSelectedPermissions.length;
      await accessControlApi.updateUser(
        userId,
        {
          outletId,
          role: selectedRole || getUserOutletRole(user, outletId) || ROLES.USER,
          departmentAccessList: selectedDepartmentAccess,
          outletPermissions: validSelectedPermissions,
        },
        authMode ?? undefined,
      );
      if (removedInvalidPermissionCount > 0) {
        messageApi.warning(
          `${removedInvalidPermissionCount} obsolete or invalid permission key${removedInvalidPermissionCount === 1 ? " was" : "s were"} removed.`,
        );
      }
      messageApi.success(APP_MESSAGES.SUCCESS_ASSIGN);
      navigate(ROUTES_PATHS.PERMISSION_MANAGEMENT);
    } catch (error) {
      console.error(error);
      messageApi.error(
        error instanceof Error ? error.message : APP_MESSAGES.ERROR_SAVE,
      );
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-96px)] bg-slate-50 px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link to={ROUTES_PATHS.PERMISSION_MANAGEMENT}>
              <Button
                type="text"
                aria-label="Back to user permissions"
                icon={<ArrowLeftOutlined />}
                className="mt-1"
              />
            </Link>
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                <ShieldCheck size={15} />
                Access control
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                Assign Permissions to{" "}
                <span className="text-blue-700">
                  {formatEmployeeName(user.name, "User")}
                </span>
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Configure this user&apos;s role, team scope, and individual CRM
                permissions for the selected outlet.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pl-11 lg:justify-end lg:pl-0">
            <Tag color={verified ? "green" : "default"}>
              {verified ? "Verified team member" : "Not verified"}
            </Tag>
            <Tag color={getRoleTagColor(selectedRole)}>
              {formatRoleLabel(selectedRole) || "Role not assigned"}
            </Tag>
          </div>
        </header>

        <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500" />
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(280px,1.25fr)_2fr] lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar
                size={58}
                style={{
                  background: token.colorPrimaryBg,
                  color: token.colorPrimary,
                  fontWeight: 700,
                }}
              >
                {getUserInitials(user.name)}
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-lg font-bold text-slate-950">
                  {formatEmployeeName(user.name, "User")}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <Phone size={14} className="shrink-0" />
                  <span className="truncate">{user.phone_number || "No phone number"}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <Mail size={14} className="shrink-0" />
                  <span className="truncate">{user.email || "No email address"}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <AccessSummaryItem
                icon={<UserRound size={18} />}
                label="Assigned role"
                value={formatRoleLabel(selectedRole) || "Not assigned"}
              />
              <AccessSummaryItem
                icon={<Building2 size={18} />}
                label="Department"
                value={
                  targetUserDepartment
                    ? formatDepartmentAccessLabel(targetUserDepartment)
                    : "Not assigned"
                }
              />
              <AccessSummaryItem
                icon={<KeyRound size={18} />}
                label="Permissions"
                value={`${visibleSelectedPermissions.length} of ${allPermissionKeys.length}`}
              />
            </div>
          </div>
        </section>

        {!targetUserIsSuperAdmin && !targetUserInManagedDepartment && (
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            message="Department access required"
            description="This user is outside your assigned departments, so their permissions cannot be changed."
          />
        )}
        {targetUserIsSuperAdmin && (
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message="Super Admin is protected"
            description="Each outlet has one protected Super Admin owner. Additional full-access administrators must use the Sub-Super Admin role."
          />
        )}

        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                <ShieldCheck size={19} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">Role assignment</h2>
                <p className="text-sm text-slate-500">
                  Start with a role, then fine-tune individual permissions.
                </p>
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-700">
                Assigned role
              </span>
              <Select
                placeholder="Select a role"
                value={selectedRole}
                onChange={handleRoleChange}
                disabled={!currentUserIsSuperAdmin || targetUserIsSuperAdmin}
                size="large"
                options={[
                  {
                    label: "Super Admin - One protected owner per outlet",
                    value: ROLES.SUPER_ADMIN,
                    disabled: true,
                  },
                  {
                    label: "Sub-Super Admin - Full customizable access",
                    value: ROLES.SUB_SUPER_ADMIN,
                  },
                  { label: "Admin - Most permissions", value: ROLES.ADMIN },
                  {
                    label: "Manager - Limited permissions",
                    value: ROLES.MANAGER,
                  },
                  { label: "User - Basic permissions", value: ROLES.USER },
                ]}
              />
            </label>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              Sub-Super Admin starts with full access. Only the outlet Super
              Admin can change roles or manage Sub-Super Admin access.
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700">
                <UsersRound size={19} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">
                  Department and team scope
                </h2>
                <p className="text-sm text-slate-500">
                  Control which teams this role can manage.
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-500">Primary department</span>
              {targetUserDepartment ? (
                <Tag color="geekblue" style={{ margin: 0 }}>
                  {formatDepartmentAccessLabel(targetUserDepartment)}
                </Tag>
              ) : (
                <span className="text-sm font-medium text-slate-400">
                  Not assigned
                </span>
              )}
            </div>

            {showDepartmentAccess ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  Allowed departments and teams
                </span>
                <Select
                  mode="multiple"
                  allowClear
                  size="large"
                  placeholder="Select departments or teams"
                  options={departmentOptions}
                  value={effectiveDepartmentAccess}
                  onChange={handleDepartmentAccessChange}
                  disabled={departmentAccessEditingDisabled}
                  optionFilterProp="label"
                  maxTagCount="responsive"
                />
              </label>
            ) : (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm text-blue-800">
                This role uses individual permissions and its assigned
                department as the access scope.
              </div>
            )}
          </section>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                  <LockKeyhole size={19} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-950">
                      Custom permissions
                    </h2>
                    <Tag color="blue">
                      {visibleSelectedPermissions.length}/{allPermissionKeys.length} selected
                    </Tag>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Search by permission, action, or module and adjust access
                    with precision.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  allowClear
                  size="large"
                  value={permissionSearch}
                  placeholder="Search permissions"
                  prefix={<Search size={16} className="text-slate-400" />}
                  onChange={(event) => setPermissionSearch(event.target.value)}
                  className="sm:w-72"
                />
                <Button
                  size="large"
                  icon={<BadgeCheck size={16} />}
                  disabled={permissionEditingDisabled}
                  onClick={handleSelectAllPermissions}
                >
                  Select all
                </Button>
                <Button
                  size="large"
                  disabled={
                    permissionEditingDisabled ||
                    visibleSelectedPermissions.length === 0
                  }
                  onClick={handleClearPermissions}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <Progress
                percent={selectedPermissionPercentage}
                showInfo={false}
                strokeColor={token.colorPrimary}
                trailColor={token.colorFillSecondary}
              />
              <span className="text-xs font-medium text-slate-500">
                {selectedPermissionPercentage}% access coverage
              </span>
            </div>
          </div>
          {isFeatureAccessConfigured && disabledModulePermissionCount > 0 && (
            <Alert
              type="info"
              showIcon
              message={`${disabledModulePermissionCount} permissions are hidden because their modules are disabled for this outlet.`}
              description="Enable the corresponding module in Outlet Feature Access before assigning those permissions. Existing hidden grants are preserved when you save."
              style={{ margin: "16px 20px 0" }}
            />
          )}

          <div className="p-5">
            {filteredPermissionGroups.length > 0 ? (
              <div className="grid gap-4">
                {filteredPermissionGroups.map((section) => {
                  const fullSection =
                    permissionsBySection.find(
                      (candidate) =>
                        candidate.sectionLabel === section.sectionLabel
                    ) ?? section;
                  const sectionPermissions = fullSection.submodules.flatMap(
                    (submodule) => submodule.permissions
                  );
                  const sectionPermissionKeys = sectionPermissions.map(
                    (permission) => permission.key
                  );
                  const selectedInCategory = sectionPermissions.filter(
                    (permission) =>
                      selectedPermissionKeySet.has(permission.key)
                  ).length;

                  return (
                    <section
                      key={section.sectionLabel}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            {section.sectionLabel}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {selectedInCategory} of {sectionPermissions.length} selected
                            {permissionSearch
                              ? ` · ${section.submodules.reduce(
                                  (total, submodule) =>
                                    total + submodule.permissions.length,
                                  0
                                )} matching`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Tag style={{ margin: 0 }}>
                            {sectionPermissions.length} permissions
                          </Tag>
                          <Button
                            size="small"
                            disabled={
                              permissionEditingDisabled ||
                              selectedInCategory === sectionPermissions.length
                            }
                            onClick={() =>
                              handleSelectPermissionSection(
                                sectionPermissionKeys,
                                section.sectionLabel
                              )
                            }
                          >
                            Select section
                          </Button>
                          <Button
                            size="small"
                            disabled={
                              permissionEditingDisabled ||
                              selectedInCategory === 0
                            }
                            onClick={() =>
                              handleClearPermissionSection(
                                sectionPermissionKeys,
                                section.sectionLabel
                              )
                            }
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {section.submodules.map((submodule) => {
                          const fullSubmodule = fullSection.submodules.find(
                            (candidate) =>
                              candidate.submoduleLabel ===
                              submodule.submoduleLabel
                          );
                          const submodulePermissions =
                            fullSubmodule?.permissions ?? submodule.permissions;
                          const submodulePermissionKeys =
                            submodulePermissions.map(
                              (permission) => permission.key
                            );
                          const selectedInSubmodule =
                            submodulePermissions.filter((permission) =>
                              selectedPermissionKeySet.has(permission.key)
                            ).length;

                          return (
                            <div
                              key={submodule.submoduleLabel}
                              className="rounded-lg border border-slate-200 bg-white p-3"
                            >
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {submodule.submoduleLabel}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Submodule · {selectedInSubmodule} of{" "}
                                    {submodulePermissions.length} selected
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Tag color="blue" style={{ margin: 0 }}>
                                    {submodulePermissions.length} permissions
                                  </Tag>
                                  <Button
                                    size="small"
                                    disabled={
                                      permissionEditingDisabled ||
                                      selectedInSubmodule ===
                                        submodulePermissions.length
                                    }
                                    onClick={() =>
                                      handleSelectPermissionSection(
                                        submodulePermissionKeys,
                                        submodule.submoduleLabel
                                      )
                                    }
                                  >
                                    Select submodule
                                  </Button>
                                  <Button
                                    size="small"
                                    disabled={
                                      permissionEditingDisabled ||
                                      selectedInSubmodule === 0
                                    }
                                    onClick={() =>
                                      handleClearPermissionSection(
                                        submodulePermissionKeys,
                                        submodule.submoduleLabel
                                      )
                                    }
                                  >
                                    Clear
                                  </Button>
                                </div>
                              </div>

                              <Row gutter={[12, 12]}>
                                {submodule.permissions.map((permission) => {
                                  const isSelected =
                                    selectedPermissionKeySet.has(
                                      permission.key
                                    );

                                  return (
                                    <Col
                                      key={permission.key}
                                      xs={24}
                                      md={12}
                                      xl={8}
                                    >
                                      <div
                                        className={`h-full rounded-lg border p-4 transition ${
                                          permissionEditingDisabled
                                            ? "opacity-70"
                                            : "hover:-translate-y-0.5 hover:shadow-sm"
                                        }`}
                                        style={{
                                          background: isSelected
                                            ? token.colorPrimaryBg
                                            : token.colorBgContainer,
                                          borderColor: isSelected
                                            ? token.colorPrimaryBorder
                                            : token.colorBorderSecondary,
                                        }}
                                      >
                                        <Checkbox
                                          checked={isSelected}
                                          disabled={permissionEditingDisabled}
                                          onChange={(event) =>
                                            handlePermissionToggle(
                                              permission.key,
                                              event.target.checked
                                            )
                                          }
                                          style={{
                                            alignItems: "flex-start",
                                            width: "100%",
                                          }}
                                        >
                                          <div className="min-w-0 pl-1">
                                            <div className="font-semibold text-slate-900">
                                              {permission.label}
                                            </div>
                                            <div className="mt-1 text-xs leading-5 text-slate-500">
                                              {permission.description}
                                            </div>
                                            <code className="mt-2 block break-all text-[10px] text-slate-400">
                                              {permission.key}
                                            </code>
                                          </div>
                                        </Checkbox>
                                      </div>
                                    </Col>
                                  );
                                })}
                              </Row>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  permissionSearch
                    ? `No permissions match "${permissionSearch}"`
                    : isFeatureAccessConfigured
                      ? "No permissions are available for this outlet's assigned modules"
                      : "No permissions available"
                }
              />
            )}

            {permissionSearch && filteredPermissionGroups.length > 0 && (
              <div className="mt-4 text-center text-xs text-slate-500">
                Showing {matchingPermissionCount} matching permissions
              </div>
            )}
          </div>
        </section>

        <div className="sticky bottom-4 z-20 mt-5 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                {visibleSelectedPermissions.length} permissions selected
              </div>
              <div className="text-xs text-slate-500">
                Review the role and access scope before saving.
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Link to={ROUTES_PATHS.PERMISSION_MANAGEMENT}>
                <Button
                  icon={<ArrowLeftOutlined />}
                  size="large"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </Link>
              <Button
                type="primary"
                size="large"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saveLoading}
                disabled={permissionEditingDisabled}
                className="w-full sm:w-auto"
              >
                {targetUserIsSuperAdmin ? "Protected owner" : "Save permissions"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function AccessSummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-2 truncate text-sm font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

function getUserInitials(name?: string) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "U";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getRoleTagColor(role?: string) {
  if (isSuperAdminRole(role)) return "red";
  if (isSubSuperAdminRole(role)) return "volcano";
  if (isRoleMatch(role, ROLES.ADMIN)) return "orange";
  if (isRoleMatch(role, ROLES.MANAGER)) return "purple";
  return "blue";
}

function getPermissionLocation(permission: PermissionDTO) {
  return getSidebarPermissionLocation(permission.key, permission.category);
}

function formatPermissionKeyLabel(permissionKey: string) {
  return permissionKey
    .replace(/^CRM_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
