export type AttendanceStatus = "PRESENT" | "ON_LEAVE" | "ABSENT";

export interface AttendanceDailyQuery {
  outletId: string;
  date: number;
}

export interface AttendanceMonthlyQuery {
  outletId: string;
  month: string;
  includeSalary: boolean;
}

export interface AttendanceDeleteQuery {
  outletId: string;
}

export interface AttendanceIdParams {
  attendanceId: string;
}

export interface AttendanceTeamMember {
  id: string;
  userName: string;
  userProfileId: string;
  empCode?: string;
  department?: string;
  designation?: string;
  isActive?: boolean;
  isOnPayRoll?: boolean;
  teamHeadProfileId?: string;
}

export interface AttendanceRecordDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface AttendanceMonthlyRecord extends Record<string, unknown> {
  id: string;
  checkInTime?: number;
  checkOutTime?: number;
  dayId?: string;
  isPresent?: boolean;
  userId?: string;
}

export interface LeaveApplicationRecord {
  id: string;
  userProfileId: string;
  leaveType: string;
  fromDate: number;
  toDate: number;
  duration?: string;
}

export interface AttendanceHoliday {
  id: string;
  date?: number | string;
  dateString?: string;
  isActive: boolean;
  isPaid?: boolean;
  name?: string;
  title?: string;
  year: string;
}

export interface AttendanceSalary {
  id: string;
  userId: string;
  monthlySalary: number;
  otAllowed: boolean;
  otRatePerHour: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  advanceDeduction: number;
  otherDeduction: number;
  isActive: boolean;
}

export interface AttendanceDailyRow extends Record<string, unknown> {
  id: string;
  attendanceStatus: AttendanceStatus;
  dayId: string;
  empCode?: string;
  isPresent?: boolean;
  leaveType?: string;
  userId: string;
  userName: string;
}

export interface AttendanceDailyResult {
  items: AttendanceDailyRow[];
  team: AttendanceTeamMember[];
}

export interface AttendanceMonthlyResult {
  attendance: AttendanceMonthlyRecord[];
  holidays: AttendanceHoliday[];
  leaves: LeaveApplicationRecord[];
  salaries: AttendanceSalary[];
  team: AttendanceTeamMember[];
}

export interface AttendanceDeleteResult {
  id: string;
}
