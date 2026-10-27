export const TEAM_TREE_ROLES = [
  "USER",
  "SUPER_ADMIN",
  "SUB_SUPER_ADMIN",
  "ADMIN",
  "SUPPORT",
  "MANAGER",
] as const;

export const TEAM_TREE_DEPARTMENTS = [
  "SALES",
  "IT",
  "HR",
  "ACCOUNT",
  "SUPPORT",
  "HARDWARE",
] as const;

export type TeamTreeRole = (typeof TEAM_TREE_ROLES)[number];
export type TeamTreeDepartment = (typeof TEAM_TREE_DEPARTMENTS)[number];

export interface CreateTeamTreeUserInput {
  outletId: string;
  name: string;
  phoneNumber: string;
  department: TeamTreeDepartment;
  roleInZone: TeamTreeRole;
  zoneList: string[];
  teamHeadProfileId?: string;
  zoneHeadProfileId?: string;
  empCode: string;
  isOnPayRoll: boolean;
  isActive: boolean;
}

export interface TeamTreeUserRecord {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone_number: string;
  role?: string;
  outletId: string;
  outlets: string[];
  permissions: Array<{
    outletId: string;
    role?: string;
    departmentAccessList?: string[];
    outletPermissions?: string[];
  }>;
  created_time: string;
}

export interface TeamTreeMemberRecord {
  id: string;
  userName: string;
  userProfileId: string;
  roleInZone: string;
  teamHeadProfileId: string;
  zoneHeadProfileId: string;
  zoneList: string[];
  code: string;
  designation: string;
  empCode: string;
  department: string;
  isOnPayRoll: boolean;
  uid: string;
  isActive: boolean;
  onRole: boolean;
  team: string;
  stageAccessList: unknown[];
  createdDate: number;
  createdBy: string;
}

export interface CreateTeamTreeUserResult {
  user: TeamTreeUserRecord;
  teamMember: TeamTreeMemberRecord;
  linkedExistingUser: boolean;
}
