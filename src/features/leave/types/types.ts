export interface LeaveApplication {
  id: string;

  // User Info
  userProfileId: string;
  managerId: string;
  managerName: string;
  userName?: string;

  // Leave Details
  leaveType: string;
  leaveNote: string;
  duration: string; // Full Day / Half Day
  noDays: number;
  status: "REQUESTED" | "APPROVED" | "REJECTED";

  // Dates
  fromDate: number;
  toDate: number;
  createdDate: number; // millis
  updateddate?: number;
  dayId: string; // "2025-11-19"
  monthId: string; // "2025-11"

  // Other
  actionTakenBy?: string;
  leaveApplicationId?: string;
  remark?: string | null;
}

export enum LeaveCode {
  CL = 'CL',
  SL = 'SL',
  EL = 'EL',
  LWP = 'LWP',
  CO = 'CO',
  ML = 'ML',
  PL = 'PL',
}

export interface LeaveType {
  id: string;                // Unique ID (UUID / Firestore ID)
  name: string;              // Casual Leave, Sick Leave, etc.
  code?: 'CL' | 'SL' | 'EL' | 'LWP' | 'CO' | 'ML' | 'PL'; // Leave codes
  description?: string;

  isPaid: boolean;           // Paid or unpaid leave
  maxPerYear?: number;       // Max allowed per year (undefined = unlimited)
  accrualType: 'YEARLY' | 'MONTHLY' | 'EVENT_BASED';
  accrualRate?: number;      // Monthly accrual (e.g., 1.25 for EL)

  carryForward?: boolean;     // Can carry to next year
  carryForwardLimit?: number;

  requiresApproval?: boolean;
  requiresDocument?: boolean; // Medical / legal proof
  allowHalfDay?: boolean;

  applicableFor?: 'ALL' | 'MALE' | 'FEMALE'; // For maternity/paternity

  isActive?: boolean;

  createdAt: string;         // ISO date
  updatedAt?: string;
}

export interface LeaveBalance {
  id?: string;
  userId: string;             // userProfileId from TEAM_TREE
  userName?: string;  
  empCode?: string;        // Cached for quick display
  designation?: string;       // Cached from TEAM_TREE
  managerId?: string;         // Manager's userProfileId
  managerName?: string;       // Manager's name (cached)
  
  totalLeaves: number;        // Yearly allocated leaves (editable by HR/Admin)
  usedLeaves: number;         // Total approved leaves used
  remainingLeaves: number;    // Calculated: totalLeaves - usedLeaves

  year: number;               // 2025, 2026 etc.
  lastUpdated?: number;       // Timestamp in milliseconds
  updatedBy?: string;         // User ID who last updated
}

export interface HolidayDTO {
  id: string;                 // Unique ID
  title?: string;             // Holiday title (e.g., Diwali)
  name?: string;              // Legacy field - same as title
  date: number | string;      // Timestamp (milliseconds) or YYYY-MM-DD string
  dateString?: string;        // YYYY-MM-DD format for easy querying
  year: string;               // Year as string (e.g., "2025")

  type?: 'NATIONAL' | 'OPTIONAL' | 'REGIONAL';
  isPaid?: boolean;            // Paid holiday or not

  applicableStates?: string[]; // ["MH", "KA", "TN"]
  applicableOutlets?: string[]; // Outlet IDs (optional)

  description?: string;
  isActive?: boolean;

  createdAt?: string | number;
  updatedAt?: string | number;
  lastUpdated?: number;       // Timestamp in milliseconds
  updatedBy?: string;         // User ID who last updated
}
