export interface StageAccess {
  id: string;
  title: string;
  value: number;
}

export interface TeamTreeDTO {
  id: string;
  userName: string;
  userProfileId: string;
  roleInZone: string;
  teamHeadProfileId: string;
  zoneHeadProfileId: string;
  zoneList: string[];
  code: string;
  designation: string;
  empCode?: string;
  department?: string;
  isOnPayRoll?: boolean;

  uid: string;
  isActive: boolean;
  onRole: boolean;
  team: string;
  stageAccessList: StageAccess[];
}
