import type { AuthorizedUserProfile, OutletPermissions } from "./auth.types.js";

export interface PermissionRecord {
  id: string;
  key: string;
  label?: string;
  description?: string;
  category?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface PermissionWriteInput {
  outletId: string;
  key: string;
  label: string;
  description: string;
  category: string;
}

export type PermissionUpdateInput = Omit<PermissionWriteInput, "key">;

export interface OutletQuery {
  outletId: string;
}

export interface ResourceParams {
  resourceId: string;
}

export interface PermissionUserRecord extends AuthorizedUserProfile {
  name: string;
  email: string;
  phone_number: string;
  department?: string;
  verified: boolean;
}

export interface PermissionUserDetail {
  user: PermissionUserRecord;
  permissionMaster: PermissionRecord[];
  departments: string[];
}

export interface UserAccessUpdateInput {
  outletId: string;
  role: string;
  departmentAccessList: string[];
  outletPermissions: string[];
}

export interface UserAccessUpdateResult {
  userId: string;
  uid?: string;
  permissions: OutletPermissions[];
  updatedAt: number;
}

export interface OutletSummary {
  id: string;
  name: string;
  branch?: string;
  city?: string;
  state?: string;
  active?: boolean;
  createdDate?: number;
  renewalDate?: number;
}

export interface OutletFeatureParams {
  targetOutletId: string;
}

export interface OutletFeatureUpdateInput {
  outletId: string;
  enabledFeatureKeys: string[];
  expectedRevision?: number;
}

export interface OutletFeatureAccessResult {
  outletId: string;
  enabledFeatureKeys: string[];
  isConfigured: boolean;
  revision: number;
  userCount?: number;
}

export interface StoredFeatureConfiguration {
  enabledFeatureKeys: string[];
  revision: number;
  updatedAt: number;
  updatedBy: string;
  schemaVersion: 2;
}
