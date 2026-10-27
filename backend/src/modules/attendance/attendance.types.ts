export type PostgresAttendanceEventType = "IN" | "OUT";

export interface PostgresAttendanceEventInput {
  outletId: string;
  userId: string;
  deviceId: string;
  deviceUserId?: string;
  eventType: PostgresAttendanceEventType;
  timestamp: number;
  source?: string;
  externalEventId?: string;
}
