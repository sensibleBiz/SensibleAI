import { usePermission } from "../hooks/usePermission";

interface CanProps {
  permission?: string;
  all?: string[];
  any?: string[];
  roles?: string[];
  children: React.ReactNode;
}

export const Can: React.FC<CanProps> = ({
  permission,
  all,
  any,
  roles,
  children,
}) => {
  const { hasPermission, hasAllPermissions, hasAnyPermission, hasAnyRole } =
    usePermission();

  const checks: boolean[] = [];

  // Single permission
  if (permission) checks.push(hasPermission(permission));

  // All required
  if (all?.length) checks.push(hasAllPermissions(all));

  // Any one required
  if (any?.length) checks.push(hasAnyPermission(any));

  if (roles?.length) checks.push(hasAnyRole(roles));

  const allowed = checks.some(Boolean);

  if (!allowed) return null;

  return <>{children}</>;
};


{/* <Can permission="CRM_LEADS_CREATE">
  <Button>Add Lead</Button>
</Can> */}


{/* <Can all={["CRM_LEADS_EDIT", "CRM_LEADS_VIEW"]}>
  <Button>Edit Lead</Button>
</Can> */}

{/* <Can any={["CRM_LEADS_ASSIGN", "CRM_LEADS_EDIT"]}>
  <Button>Assign Lead</Button>
</Can> */}
