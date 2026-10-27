import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { getUserOutletAccess, getUserOutletRole, isRoleMatch, isSubSuperAdminRole, isSuperAdminRole } from "../utils/permissionUtils";

const postgresPermissionAliases: Record<string, string> = {
  CRM_ACTIVITY_VIEW: "activities.read",
  CRM_ACTIVITY_CREATE: "activities.create",
  CRM_ACTIVITY_EDIT: "activities.update",
  CRM_ACTIVITY_DELETE: "activities.delete",
  CRM_TEAMTREE_VIEW: "team.read",
  CRM_TEAMTREE_CREATE: "users.create",
  CRM_TEAMTREE_EDIT: "team.manage",
  CRM_TEAMTREE_DELETE: "team.manage",
  CRM_CALL_LOGS_REPORT_VIEW: "calls.reports.read",
  CRM_LEADS_VIEW: "leads.read",
  CRM_TASK_VIEW: "tasks.read",
  CRM_TASK_CREATE: "tasks.create",
  CRM_TASK_UPDATE: "tasks.update",
  CRM_TASK_ASSIGN: "tasks.assign",
  CRM_TASK_DELETE: "tasks.delete",
  CRM_ATTENDANCE_VIEW_ADMIN: "attendance.read",
  CRM_ATTENDANCE_DELETE: "attendance.delete",
  CRM_LEAVE_VIEW_ADMIN: "leave.read",
  CRM_LEAVE_CREATE: "leave.create",
  CRM_LEAVE_APPROVE: "leave.manage",
  CRM_PERMISSION_MASTER_VIEW: "access_control.permissions.view",
  CRM_PERMISSION_MASTER_CREATE: "access_control.permissions.create",
  CRM_PERMISSION_MASTER_EDIT: "access_control.permissions.update",
  CRM_PERMISSION_MASTER_DELETE: "access_control.permissions.delete",
  CRM_PERMISSION_VIEW: "access_control.users.view",
  CRM_PERMISSION_EDIT: "access_control.users.manage",
  CRM_SETTINGS_EDIT: "access_control.features.manage",
  CRM_PAYROLL_VIEW: "payroll.read",
  CRM_PAYROLL_MANAGE: "payroll.manage",
  CRM_WHATSAPP_VIEW: "whatsapp.read",
};

export const usePermission = () => {
  const { user, postgresAccess, authMode } = useSelector((state: RootState) => state.auth);
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const postgresOutlet = postgresAccess?.outlets.find((outlet) => outlet.id === outletId);
  const currentRole = authMode === "postgres" ? postgresOutlet?.roleName : getUserOutletRole(user, outletId);
  const isSuperAdmin = authMode === "postgres" ? postgresAccess?.tenant.isTenantAdmin === true : isSuperAdminRole(currentRole);
  const isSubSuperAdmin = authMode === "postgres" ? false : isSubSuperAdminRole(currentRole);
  const outletAccess = getUserOutletAccess(user, outletId);
  const perms = outletAccess?.outletPermissions ?? [];
  const hasDefaultSubSuperAdminAccess = isSubSuperAdmin && !Array.isArray(outletAccess?.outletPermissions);

  const hasPermission = (permission: string) => {
    if (authMode === "postgres") {
      return isSuperAdmin || Boolean(postgresOutlet?.permissions.includes(postgresPermissionAliases[permission] ?? permission));
    }
    return isSuperAdmin || hasDefaultSubSuperAdminAccess || perms.includes(permission);
  };

  const hasAllPermissions = (required: string[]) => required.every(hasPermission);
  const hasAnyPermission = (required: string[]) => required.some(hasPermission);
  const hasRole = (role: string) => isRoleMatch(currentRole, role);
  const hasAnyRole = (required: string[]) => required.some(hasRole);

  return {
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    hasRole,
    hasAnyRole,
    currentRole,
    isSuperAdmin,
    isSubSuperAdmin,
  };
};
