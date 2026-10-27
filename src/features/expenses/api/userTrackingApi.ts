import { apiRequest } from "@/shared/api/apiClient";
import { postgresSession } from "@/features/auth";

const postgresOwnedAuthOptions = () =>
  postgresSession.getAccessToken()
    ? { authMode: "postgres" as const }
    : {};

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

interface UserTrackingFilters {
  outletId: string;
  userId: string;
  date: string;
  limit?: number;
  cursor?: string;
}

export interface CreateUserTrackingPointInput {
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

export const userTrackingApi = {
  listHistory(filters: UserTrackingFilters, signal?: AbortSignal) {
    const query = new URLSearchParams({
      outletId: filters.outletId,
      userId: filters.userId,
      date: filters.date,
      ...(filters.limit ? { limit: String(filters.limit) } : {}),
      ...(filters.cursor ? { cursor: filters.cursor } : {}),
    });
    return apiRequest<UserTrackingPage>(`/api/v1/user-tracking/history?${query}`, {
      signal,
      ...postgresOwnedAuthOptions(),
    });
  },
  createPoint(input: CreateUserTrackingPointInput, signal?: AbortSignal) {
    return apiRequest<UserTrackingPoint>("/api/v1/user-tracking/points", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
      ...postgresOwnedAuthOptions(),
    });
  },
};
