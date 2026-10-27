export const CALL_DIRECTIONS = ["incoming", "outgoing", "missed", "rejected"] as const;
export type PostgresCallDirection = (typeof CALL_DIRECTIONS)[number];

export interface PostgresCallRecord {
  id: string;
  tenantId: string;
  businessId: string;
  outletId: string;
  leadId: string | null;
  customerId: string | null;
  loggedByUserId: string | null;
  direction: PostgresCallDirection;
  durationSeconds: number;
  number: string;
  receiverMobileNo: string;
  receiverName: string;
  employeeLabel: string;
  department: string;
  loggedAt: Date;
  phoneAccountId: string | null;
  simLabel: string | null;
  simPhoneNumber: string | null;
  subscriptionId: string | null;
  deviceId: string | null;
  externalCallSource: string | null;
  externalCallId: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostgresCallCreateInput {
  outletId: string;
  leadId?: string;
  customerId?: string;
  loggedByUserId?: string;
  direction: PostgresCallDirection;
  durationSeconds: number;
  number: string;
  receiverMobileNo?: string;
  receiverName: string;
  name?: string;
  department?: string;
  timestamp: number;
  phoneAccountId?: string;
  simLabel?: string;
  simPhoneNumber?: string;
  subscriptionId?: string;
  deviceId?: string;
  externalCallSource?: string;
  externalCallId?: string;
}
