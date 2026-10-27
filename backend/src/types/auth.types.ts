import type { DecodedIdToken } from "firebase-admin/auth";

export interface OutletRole {
  outletId?: string;
  role?: string;
  departmentAccessList?: string[];
}

export interface OutletPermissions {
  outletId?: string;
  role?: string;
  departmentAccessList?: string[];
  outletPermissions?: string[];
}

export interface AuthorizedUserProfile {
  id: string;
  uid?: string;
  role?: string;
  outletId?: string;
  outlets?: string[];
  /** Legacy fallback; canonical outlet roles live in `permissions`. */
  outletRoles?: OutletRole[];
  permissions?: OutletPermissions[];
  departmentAccessList?: string[];
}

export interface AuthContext {
  token: DecodedIdToken;
  uid: string;
}
