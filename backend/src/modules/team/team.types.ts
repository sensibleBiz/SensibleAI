export const POSTGRES_TEAM_ROLES = ["USER", "SUPER_ADMIN", "SUB_SUPER_ADMIN", "ADMIN", "SUPPORT", "MANAGER"] as const;
export const POSTGRES_TEAM_DEPARTMENTS = ["SALES", "IT", "HR", "ACCOUNT", "SUPPORT", "HARDWARE"] as const;

export type PostgresTeamRole = (typeof POSTGRES_TEAM_ROLES)[number];
export type PostgresTeamDepartment = (typeof POSTGRES_TEAM_DEPARTMENTS)[number];

export interface PostgresTeamMember {
  id: string;
  userId: string;
  userProfileId: string;
  userName: string;
  email: string | null;
  phone: string | null;
  roleInZone: PostgresTeamRole;
  department: PostgresTeamDepartment;
  outletId: string;
  outletName: string;
  businessId: string;
  zoneList: string[];
  teamHeadProfileId: string | null;
  zoneHeadProfileId: string | null;
  empCode: string;
  isOnPayRoll: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostgresTeamListQuery {
  outletId: string;
  department?: PostgresTeamDepartment;
  zone?: string;
  active?: boolean;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface PostgresTeamCreateInput {
  outletId: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  password: string;
  department: PostgresTeamDepartment;
  roleInZone: PostgresTeamRole;
  zoneList: string[];
  managerUserId?: string;
  teamHeadProfileId?: string;
  zoneHeadProfileId?: string;
  empCode: string;
  isOnPayRoll: boolean;
  isActive: boolean;
}

export interface PostgresTeamUpdateInput {
  outletId: string;
  department: PostgresTeamDepartment;
  currentDepartment?: PostgresTeamDepartment;
  roleInZone?: PostgresTeamRole;
  zoneList?: string[];
  managerUserId?: string | null;
  teamHeadProfileId?: string | null;
  empCode?: string;
  isOnPayRoll?: boolean;
  isActive?: boolean;
}

export type PostgresTeamMembershipCreateInput = Omit<PostgresTeamCreateInput, "name" | "email" | "phoneNumber" | "password">;
