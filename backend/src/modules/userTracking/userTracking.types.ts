export interface PostgresUserTrackingRecord {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  address: string;
  name: string;
  recordedAt: Date;
}

export interface PostgresUserTrackingCreateInput {
  outletId: string;
  userId?: string;
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
  timestamp: number;
  accuracyMeters?: number;
  deviceId?: string;
  externalSource?: string;
  externalId?: string;
}
