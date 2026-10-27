export interface CallLogEntry {
  id: string;

  // Caller Info
  name: string;
  number: string;

  // Receiver Info
  receiverName: string;
  receiverMobileNo: string;

  // Call Details
  direction: "incoming" | "outgoing" | "missed" | string;
  durationSeconds: number;

  // Device / SIM Info
  phoneAccountId: string;
  simLabel: string;
  simPhoneNumber: string | null;
  subscriptionId: string | null;
  deviceId: string | null;

  // Metadata
  department: string;
  createdAt: number; // milliseconds
  timestamp: number; // milliseconds
  uploadedAt: string; // ISO string
}
