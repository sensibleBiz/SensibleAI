import { usePermission } from "@/features/access-control";
import { useOutletFeatureAccess } from "@/features/outlets";
import { isInternalAdminOutlet, ROUTES_PATHS } from "@/shared/lib/constants";
import type { OutletFeatureKey } from "@/features/outlets";
import { getSidebarMenuOption } from "@/shared/lib/sidebarMenuConfig";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { Navigate, useLocation } from "react-router-dom";

interface PermissionRouteProps {
  children: React.ReactNode;
  permission?: string;
  all?: string[];
  any?: string[];
  roles?: string[];
  feature?: OutletFeatureKey;
  featureBypassRoles?: string[];
}

const PermissionRouteGate: React.FC<PermissionRouteProps> = ({
  children,
  permission,
  all,
  any,
  roles,
  feature,
  featureBypassRoles,
}) => {
  const { hasPermission, hasAllPermissions, hasAnyPermission, hasAnyRole } =
    usePermission();
  const { hasOutletFeature } = useOutletFeatureAccess();
  const location = useLocation();
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const menuAccess = getSidebarMenuOption(location.pathname);
  const hasExplicitPermissionRules = Boolean(
    permission || all?.length || any?.length || roles?.length
  );

  const checks: boolean[] = [];

  if (permission) checks.push(hasPermission(permission));
  if (all?.length) checks.push(hasAllPermissions(all));
  if (any?.length) checks.push(hasAnyPermission(any));
  if (roles?.length) checks.push(hasAnyRole(roles));

  if (!hasExplicitPermissionRules && menuAccess) {
    if (menuAccess.requiredPermissions.length) {
      checks.push(hasAnyPermission([...menuAccess.requiredPermissions]));
    }
    if (menuAccess.fallbackRoles?.length) {
      checks.push(hasAnyRole([...menuAccess.fallbackRoles]));
    }
  }

  const permissionAllowed = checks.length === 0 || checks.some(Boolean);
  const effectiveFeature = feature ?? menuAccess?.featureKey;
  const effectiveFeatureBypassRoles =
    featureBypassRoles ?? menuAccess?.featureBypassRoles;
  const featureAllowed =
    Boolean(
      effectiveFeatureBypassRoles?.length &&
        hasAnyRole([...effectiveFeatureBypassRoles])
    ) || hasOutletFeature(effectiveFeature);
  const internalOutletAllowed =
    !menuAccess?.internalOnly || isInternalAdminOutlet(outletId);
  const allowlistedOutletAllowed =
    !menuAccess?.allowedOutletIds?.length ||
    Boolean(outletId && menuAccess.allowedOutletIds.includes(outletId));
  const allowed =
    permissionAllowed &&
    featureAllowed &&
    internalOutletAllowed &&
    allowlistedOutletAllowed;

  if (!allowed) {
    const reason = !internalOutletAllowed || !allowlistedOutletAllowed
      ? "This module is available only from an internal administration outlet."
      : !featureAllowed
        ? "Your permission may be assigned, but this module is disabled for the selected outlet. Ask an administrator to enable Outlet Feature Access."
        : "You do not have the required permission for this module in the selected outlet.";

    return (
      <Navigate
        to={ROUTES_PATHS.NO_ACCESS}
        replace
        state={{ accessDeniedReason: reason, requestedPath: location.pathname }}
      />
    );
  }

  return <>{children}</>;
};

export default PermissionRouteGate;


{/* <PermissionRoute all={["CRM_LEADS_VIEW","CRM_LEADS_EDIT"]}>
  <LeadEditPage />
</PermissionRoute> */}

{/* <PermissionRoute permission="CRM_LEADS_VIEW">
  <LeadsDashboard />
</PermissionRoute> */}
