import type { UserProfile } from "@/features/auth";
import type { TeamTreeDTO } from "../types/types";
import { apiRequest, type ApiAuthMode } from "@/shared/api/apiClient";

export interface CreateTeamTreeUserInput {
  outletId: string;
  name: string;
  phoneNumber?: string;
  email?: string;
  password?: string;
  department: string;
  roleInZone: string;
  zoneList: string[];
  teamHeadProfileId?: string;
  zoneHeadProfileId?: string;
  managerUserId?: string;
  empCode: string;
  isOnPayRoll: boolean;
  isActive: boolean;
}

interface CreateTeamTreeUserResponse {
  user?: UserProfile;
  userId?: string;
  teamMember: TeamTreeDTO;
  linkedExistingUser: boolean;
}

export const teamTreeApi = {
  createUser(input: CreateTeamTreeUserInput, authMode: ApiAuthMode = "postgres") {
    return apiRequest<CreateTeamTreeUserResponse>("/api/v1/team-tree/users", {
      method: "POST",
      body: input,
      authMode,
    });
  },
  list(outletId: string, active?: boolean) {
    const query = new URLSearchParams({ outletId, limit: "100" });
    if (active !== undefined) query.set("active", String(active));
    return apiRequest<{ items: TeamTreeDTO[]; nextCursor: string | null }>(
      `/api/v1/team-tree/users?${query.toString()}`,
      { authMode: "postgres" },
    );
  },
  update(userId: string, input: {
    outletId: string;
    department: string;
    currentDepartment?: string;
    roleInZone?: string;
    zoneList?: string[];
    managerUserId?: string | null;
    empCode?: string;
    isOnPayRoll?: boolean;
    isActive?: boolean;
  }) {
    return apiRequest<TeamTreeDTO[]>(`/api/v1/team-tree/users/${userId}`, {
      method: "PATCH",
      body: input,
      authMode: "postgres",
    });
  },
};
