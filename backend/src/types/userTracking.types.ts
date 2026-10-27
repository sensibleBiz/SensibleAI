export interface UserTrackingQuery {
  outletId: string;
  userId: string;
  date: string;
  limit: number;
  cursor?: string;
}

export interface UserTrackingCursor {
  id: string;
  timestamp: number;
}

export interface UserTrackingDocument {
  id: string;
  data: Record<string, unknown>;
  cursor: UserTrackingCursor;
}

export interface UserTrackingPoint {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  address: string;
  name: string;
  timestamp: number;
}

export interface UserTrackingPage {
  items: UserTrackingPoint[];
  nextCursor: string | null;
}
