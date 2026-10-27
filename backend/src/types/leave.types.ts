export type LeaveStatus = "REQUESTED" | "APPROVED" | "REJECTED";

export interface LeaveListQuery {
  outletId: string;
  month: string;
  status: LeaveStatus;
  limit: number;
  cursor?: string;
}

export interface LeaveCursor {
  id: string;
  createdDate: number;
}

export interface LeaveDocument {
  id: string;
  data: Record<string, unknown>;
  cursor: LeaveCursor;
}

export interface LeaveItem {
  id: string;
  actionTakenBy?: string;
  createdDate: number;
  dayId: string;
  duration: string;
  fromDate: number;
  leaveApplicationId?: string;
  leaveNote: string;
  leaveType: string;
  managerId: string;
  managerName: string;
  monthId: string;
  noDays: number;
  remark?: string | null;
  status: LeaveStatus;
  toDate: number;
  updateddate?: number;
  userName?: string;
  userProfileId: string;
}

export interface LeaveListResult {
  items: LeaveItem[];
  nextCursor: string | null;
}

export interface LeaveIdParams {
  leaveId: string;
}

export interface LeaveStatusInput {
  outletId: string;
  status: Exclude<LeaveStatus, "REQUESTED">;
  remark: string;
}

export interface LeaveTransitionResult {
  item: LeaveItem;
}

export interface LeaveTypeItem {
  id: string;
  name: string;
  shortCode: string;
}

export interface LeaveTypeDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface LeaveTypeListQuery {
  outletId: string;
}

export interface LeaveTypeCreateInput {
  outletId: string;
  name: string;
  shortCode: string;
}

export interface LeaveTypeListResult {
  items: LeaveTypeItem[];
}

export interface LeaveTypeCreateResult {
  item: LeaveTypeItem;
}

export interface LeaveBalanceQuery {
  outletId: string;
  year: number;
  userId?: string;
}

export interface LeaveBalanceItem {
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

export interface LeaveBalanceUpdateInput {
  outletId: string;
  year: number;
  totalLeaves: number;
  reason: string;
}

export interface LeaveBalanceHistoryQuery {
  outletId: string;
  year: number;
  limit: number;
}

export interface LeaveBalanceHistoryItem {
  id: string;
  delta: number;
  entryType: 'ALLOCATION' | 'ADMIN_ADJUSTMENT' | 'LEAVE_APPROVED' | 'LEAVE_REVERSED';
  leaveRequestId?: string;
  reason: string;
  actorUserId: string;
  createdAt: string;
}

export interface HolidayListQuery { outletId: string; year: string }
export interface HolidayItem {
  id: string;
  title: string;
  name: string;
  date: string;
  dateString: string;
  year: string;
  type: 'NATIONAL' | 'OPTIONAL' | 'REGIONAL';
  isPaid: boolean;
  description: string;
  applicableStates: string[];
  applicableOutlets: string[];
  isActive: boolean;
}

export interface HolidayCreateInput {
  outletId: string;
  title: string;
  date: string;
  type: 'NATIONAL' | 'OPTIONAL' | 'REGIONAL';
  isPaid: boolean;
  description: string;
  applicableStates: string[];
  applicableOutlets: string[];
}

export interface HolidayUpdateInput {
  outletId: string;
  title?: string;
  date?: string;
  type?: 'NATIONAL' | 'OPTIONAL' | 'REGIONAL';
  isPaid?: boolean;
  description?: string;
  applicableStates?: string[];
  applicableOutlets?: string[];
}

export interface LeaveRequestCreateInput {
  outletId: string;
  leaveTypeId: string;
  fromDate: number;
  toDate: number;
  duration: "Full Day" | "Half Day";
  leaveNote: string;
}
