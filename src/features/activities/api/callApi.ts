import type { CallLogEntry } from "../types/types";
import { postgresSession } from "@/features/auth";
import { apiRequest } from "@/shared/api/apiClient";

const postgresOwnedAuthOptions = () =>
  postgresSession.getAccessToken()
    ? { authMode: "postgres" as const }
    : {};

export interface CallSummary {
  total: number;
  incoming: number;
  outgoing: number;
  missed: number;
  rejected: number;
  duration: number;
}

export interface CallDepartmentSummary {
  summary: CallSummary;
  employees: Record<string, CallSummary>;
}

export interface CallTopPerformer {
  name: string;
  dept: string;
  total: number;
  duration: number;
}

export interface CallReport {
  summary: CallSummary;
  departments: Record<string, CallDepartmentSummary>;
  availableDepartments: string[];
  topPerformers: CallTopPerformer[];
}

export type EmployeeCallItem = Pick<
  CallLogEntry,
  | "id"
  | "direction"
  | "durationSeconds"
  | "name"
  | "number"
  | "receiverMobileNo"
  | "receiverName"
  | "timestamp"
>;

export type CallDirection = "incoming" | "outgoing" | "missed" | "rejected";

interface CallReportFilters {
  outletId: string;
  startDate: number;
  endDate: number;
  department?: string;
  search?: string;
}

interface EmployeeCallFilters {
  outletId: string;
  startDate: number;
  endDate: number;
  receiverName: string;
  direction?: CallDirection;
  limit?: number;
  cursor?: string;
}

interface EmployeeCallPage {
  items: EmployeeCallItem[];
  nextCursor: string | null;
}

const appendValue = (
  searchParams: URLSearchParams,
  key: string,
  value: string | number | undefined,
) => {
  if (value !== undefined && value !== "") {
    searchParams.set(key, String(value));
  }
};

export const callApi = {
  getReport(filters: CallReportFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendValue(searchParams, "outletId", filters.outletId);
    appendValue(searchParams, "startDate", filters.startDate);
    appendValue(searchParams, "endDate", filters.endDate);
    appendValue(searchParams, "department", filters.department);
    appendValue(searchParams, "search", filters.search);
    return apiRequest<CallReport>(`/api/v1/calls/report?${searchParams}`, {
      signal,
      ...postgresOwnedAuthOptions(),
    });
  },

  getEmployeeCalls(filters: EmployeeCallFilters, signal?: AbortSignal) {
    const searchParams = new URLSearchParams();
    appendValue(searchParams, "outletId", filters.outletId);
    appendValue(searchParams, "startDate", filters.startDate);
    appendValue(searchParams, "endDate", filters.endDate);
    appendValue(searchParams, "receiverName", filters.receiverName);
    appendValue(searchParams, "direction", filters.direction);
    appendValue(searchParams, "limit", filters.limit);
    appendValue(searchParams, "cursor", filters.cursor);
    return apiRequest<EmployeeCallPage>(`/api/v1/calls?${searchParams}`, {
      signal,
      ...postgresOwnedAuthOptions(),
    });
  },
};
