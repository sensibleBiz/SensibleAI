export interface IntegrationDTO {
  id?: string; // document ID
  type: string; // e.g., "FB", "Google", "JustDial", etc.
  description: string; // description text
  integrationKey: string; // API key or credential
  autoassignenabled: boolean;
  outletId: string; // associated outlet
  isActive: boolean; // activation status
  createdDate: number; // timestamp (ms)
  modifiedDate: number; // timestamp (ms)
}

export interface IntegrationConfig {
  id: string;

  // Meta
  description: string;
  type: "FB" | string; // you can extend later (FB, GOOGLE, WHATSAPP, etc.)
  integrationKey: string;
  accessToken?: string;
  /** Sales employee who receives leads matching this Facebook ad. */
  autoAssignUserId?: string;
  autoAssignEmployeeName?: string;
  autoassignenabled: boolean;

  // Status
  isActive: boolean;

  // Outlet
  outletId: string;

  // Timestamps (milliseconds)
  createdDate: number;
  modifiedDate: number;
}

export interface AutoLeadAssignment {
  id: string;
  integrationId: string;
  userId: string;
  employeeName?: string;
  adId: string;
  platformName: string;
  isActive: boolean;
  createdDate: number;
  modifiedDate: number;
}
