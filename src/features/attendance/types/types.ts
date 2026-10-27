export interface AttendanceRecord {
  id?:string;
  checkInLocation?: string; // e.g. "LatLng(lat: 18.5070816, lng: 73.8064715)"
  checkInLocationDetails?: LocationDetails;
  checkInTime?: number; // milliseconds since epoch
  checkInSource?: string; // e.g. "BIOMETRIC", "MOBILE"
  checkInDevice?: string;

  checkOutLocation?: string; // e.g. "LatLng(lat: 18.5071327, lng: 73.8064596)"
  checkOutLocationDetails?: LocationDetails;
  checkOutTime?: number; // milliseconds since epoch
  checkOutSource?: string; // e.g. "BIOMETRIC", "MOBILE"
  checkOutDevice?: string;

  createdDate?: number; // Firestore timestamp

  dayId?: string; // e.g. "13-05-2025"
  monthId?: string; // e.g. "05-2025"
  yearId?: string; // e.g. "2025"
  leaveType?: string;
  isPresent?: boolean;
  note?: string;
  outletId?: string;
  status?: boolean;
  userId?: string;
  userName?: string;
  empCode?: string;
  attendanceStatus?: "PRESENT" | "ON_LEAVE" | "ABSENT" | string;
  /** Punch device type from attendance record, e.g. "BIOMETRIC" or "MOBILE" */
  device?: string;
  /** Punch source written by biometric sync / mobile app, e.g. "BIOMETRIC" */
  source?: string;
  dvcId?: string | number | null;
  dvcIP?: string;
  punchId?: string | number;
  txnInId?: string | number;
  txnOutId?: string | number;
}

// Nested map fields for check-in/out location details
export interface LocationDetails {
  locality: string;
  name: string;
  postalCode: string;
  street: string;
  subLocality: string;
}
