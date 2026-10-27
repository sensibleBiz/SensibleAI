export interface CallLogItem {
  id: string;
  direction: string;
  durationSeconds: number;
  number: string;
  receiverMobileNo: string;
  receiverName: string;
  timestamp: number;
}

export interface CallCursor {
  id: string;
  timestamp: number;
}

export interface CallLogDocument {
  id: string;
  data: Record<string, unknown>;
  cursor: CallCursor;
}

export interface LeadCallListQuery {
  outletId: string;
  leadId: string;
  limit: number;
  cursor?: string;
}

export interface LeadCallListResult {
  items: CallLogItem[];
  nextCursor: string | null;
}

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

export interface CallReportQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  department?: string;
  search?: string;
}

export interface CallReportResult {
  summary: CallSummary;
  departments: Record<string, CallDepartmentSummary>;
  availableDepartments: string[];
  topPerformers: CallTopPerformer[];
}

export interface EmployeeCallItem extends CallLogItem {
  name: string;
}

export interface EmployeeCallListQuery {
  outletId: string;
  startDate: number;
  endDate: number;
  receiverName: string;
  direction?: string;
  limit: number;
  cursor?: string;
}

export interface EmployeeCallListResult {
  items: EmployeeCallItem[];
  nextCursor: string | null;
}
