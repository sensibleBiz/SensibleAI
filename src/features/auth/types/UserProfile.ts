// src/features/auth/user.dto.ts
export interface Permission {
  title: string;
  value: number;
}

export interface OutletPermissions {
  outletId: string;
  /** Role, department scope, and grants are stored together per outlet. */
  role?: string;
  departmentAccessList?: string[];
  /** Omitted means role-default access; an empty array means no grants. */
  outletPermissions?: string[];
}

/** @deprecated Read-only compatibility for profiles created before access consolidation. */
export interface OutletRole {
  outletId: string;
  role: string;
  departmentAccessList?: string[];
}

export interface UserProfile {
  id: string;
  uid: string;
  name: string;
  email: string;
  role?: string;
  phone_number: string;
  password?: string;
  outletId: string;
  outlets: string[];
  quickPin?: string;
  /** @deprecated Legacy permission model. */
  permissionList?: Permission[];
  permissions?: OutletPermissions[];
  /** @deprecated Merged into `permissions` whenever the profile is saved. */
  outletRoles?: OutletRole[];
  /** @deprecated Merged into `permissions` whenever the profile is saved. */
  departmentAccessList?: string[];
  sidebarMenuOrderByOutlet?: Record<string, string[]>;
  created_time: string; // Yo;u can store as string for simplicity
}
