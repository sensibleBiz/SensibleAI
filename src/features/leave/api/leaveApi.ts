import type { LeaveApplication } from "../types/types";
import { apiRequest } from "@/shared/api/apiClient";

const postgresOwnedAuthOptions = () => ({ authMode: "postgres" as const });

export type LeaveStatus = "REQUESTED" | "APPROVED" | "REJECTED";

export interface LeaveListFilters {
  outletId: string;
  month: string;
  status: LeaveStatus;
  limit?: number;
  cursor?: string;
}

export interface LeaveListResponse {
  items: LeaveApplication[];
  nextCursor: string | null;
}

export interface LeaveTypeOption {
  id: string;
  name: string;
  shortCode: string;
}

export interface CreateLeaveTypeInput {
  name: string;
  shortCode: string;
}

export interface LeaveBalanceDto {
  id?: string;
  userId: string;
  userName: string;
  empCode: string;
  designation: string;
  managerId: string;
  managerName: string;
  totalLeaves: number;
  usedLeaves: number;
  remainingLeaves: number;
  year: number;
  lastUpdated: number;
}

export interface LeaveBalanceHistoryDto {
  id: string;
  delta: number;
  entryType: "ALLOCATION" | "ADMIN_ADJUSTMENT" | "LEAVE_APPROVED" | "LEAVE_REVERSED";
  leaveRequestId?: string;
  reason: string;
  actorUserId: string;
  createdAt: string;
}

export interface HolidayDto {
  id: string;
  title: string;
  name: string;
  date: string;
  dateString: string;
  year: string;
  type: "NATIONAL" | "OPTIONAL" | "REGIONAL";
  isPaid: boolean;
  description: string;
  applicableStates: string[];
  applicableOutlets: string[];
  isActive: boolean;
}

export interface HolidayInput {
  title: string;
  date: string;
  type: HolidayDto["type"];
  isPaid: boolean;
  description?: string;
  applicableStates?: string[];
  applicableOutlets?: string[];
}

export const leaveApi = {
  listTypes(outletId: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<{ items: LeaveTypeOption[] }>(
      `/api/v1/leave/types?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  createType(outletId: string, input: CreateLeaveTypeInput) {
    return apiRequest<{ item: LeaveTypeOption }>(
      '/api/v1/leave/types',
      {
        method: 'POST',
        body: { outletId, ...input },
        ...postgresOwnedAuthOptions(),
      },
    );
  },

  list(filters: LeaveListFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({
      outletId: filters.outletId,
      month: filters.month,
      status: filters.status,
      limit: String(filters.limit ?? 30),
    });
    if (filters.cursor) searchParams.set("cursor", filters.cursor);

    return apiRequest<LeaveListResponse>(
      `/api/v1/leave/requests?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  transitionStatus(
    outletId: string,
    leaveId: string,
    status: Exclude<LeaveStatus, "REQUESTED">,
    remark: string,
  ) {
    return apiRequest<{ item: LeaveApplication }>(
      `/api/v1/leave/${encodeURIComponent(leaveId)}/status`,
      {
        method: "PATCH",
        body: { outletId, status, remark },
        ...postgresOwnedAuthOptions(),
      },
    );
  },

  listBalances(outletId: string, year: number, userId?: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId, year: String(year) });
    if (userId) searchParams.set("userId", userId);
    return apiRequest<{ items: LeaveBalanceDto[] }>(
      `/api/v1/leave/balances?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  updateBalance(outletId: string, userId: string, year: number, totalLeaves: number, reason: string) {
    return apiRequest<{ item: LeaveBalanceDto }>(
      `/api/v1/leave/balances/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: { outletId, year, totalLeaves, reason }, ...postgresOwnedAuthOptions() },
    );
  },

  listBalanceHistory(outletId: string, userId: string, year: number, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId, year: String(year), limit: "100" });
    return apiRequest<{ items: LeaveBalanceHistoryDto[] }>(
      `/api/v1/leave/balances/${encodeURIComponent(userId)}/history?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  listHolidays(outletId: string, year: number, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId, year: String(year) });
    return apiRequest<{ items: HolidayDto[] }>(
      `/api/v1/leave/holidays?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  createHoliday(outletId: string, input: HolidayInput) {
    return apiRequest<{ item: HolidayDto }>("/api/v1/leave/holidays", {
      method: "POST",
      body: { outletId, applicableStates: [], applicableOutlets: [], ...input },
      ...postgresOwnedAuthOptions(),
    });
  },

  updateHoliday(outletId: string, holidayId: string, input: Partial<HolidayInput>) {
    return apiRequest<{ item: HolidayDto }>(
      `/api/v1/leave/holidays/${encodeURIComponent(holidayId)}`,
      { method: "PATCH", body: { outletId, ...input }, ...postgresOwnedAuthOptions() },
    );
  },

  deleteHoliday(outletId: string, holidayId: string) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<{ id: string }>(
      `/api/v1/leave/holidays/${encodeURIComponent(holidayId)}?${searchParams.toString()}`,
      { method: "DELETE", ...postgresOwnedAuthOptions() },
    );
  },

  createRequest(input: {
    outletId: string; leaveTypeId: string; fromDate: number; toDate: number;
    duration: "Full Day" | "Half Day"; leaveNote: string;
  }) {
    return apiRequest<{ item: LeaveApplication }>("/api/v1/leave/requests", {
      method: "POST", body: input, ...postgresOwnedAuthOptions(),
    });
  },
};
