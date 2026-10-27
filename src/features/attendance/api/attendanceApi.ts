import type { AttendanceRecord } from "../types/types";
import type { HolidayDTO, LeaveApplication } from "@/features/leave";
import type { SalaryMaster } from "@/features/payroll";
import type { TeamTreeDTO } from "@/features/team";
import { postgresSession } from "@/features/auth";
import { apiRequest } from "@/shared/api/apiClient";

const postgresOwnedAuthOptions = () =>
  postgresSession.getAccessToken()
    ? { authMode: "postgres" as const }
    : {};

export interface AttendanceDailyFilters {
  outletId: string;
  date: number | string;
}

export interface AttendanceDailyResponse {
  items: AttendanceRecord[];
  team: TeamTreeDTO[];
}

export interface AttendanceMonthlyFilters {
  outletId: string;
  month: string;
  includeSalary?: boolean;
}

export interface AttendanceMonthlyResponse {
  attendance: AttendanceRecord[];
  holidays: HolidayDTO[];
  leaves: LeaveApplication[];
  salaries: SalaryMaster[];
  team: TeamTreeDTO[];
}

const appendQueryValue = (
  searchParams: URLSearchParams,
  key: string,
  value: string | number | undefined,
) => {
  if (value !== undefined && value !== "") {
    searchParams.set(key, String(value));
  }
};

export const attendanceApi = {
  getDaily(filters: AttendanceDailyFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "date", filters.date);

    return apiRequest<AttendanceDailyResponse>(
      `/api/v1/attendance/daily?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  getMonthly(filters: AttendanceMonthlyFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendQueryValue(searchParams, "outletId", filters.outletId);
    appendQueryValue(searchParams, "month", filters.month);
    if (filters.includeSalary) {
      searchParams.set("includeSalary", "true");
    }

    return apiRequest<AttendanceMonthlyResponse>(
      `/api/v1/attendance/monthly?${searchParams.toString()}`,
      { signal, ...postgresOwnedAuthOptions() },
    );
  },

  deleteAttendance(outletId: string, attendanceId: string) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<{ id: string }>(
      `/api/v1/attendance/${encodeURIComponent(attendanceId)}?${searchParams.toString()}`,
      { method: "DELETE", ...postgresOwnedAuthOptions() },
    );
  },
};
