export type GeneratedContactCellValue = string | number | boolean | null;

export interface GeneratedContactImportRow {
  rowNumber: number;
  values: Record<string, GeneratedContactCellValue>;
  assignedUserId: string;
  assignedUserName: string;
  assignedEmployeeCode?: string;
}

export interface GeneratedContactImportInput {
  outletId: string;
  importId: string;
  fileName: string;
  worksheetName: string;
  uploadedAt: number;
  uploadType: "EVENT" | "OTHER";
  uploadName: string;
  event?: GeneratedContactEventDetails;
  contacts: GeneratedContactImportRow[];
}

export interface GeneratedContactEventDetails {
  id: string;
  name: string;
  description: string;
  terms: string;
  location: string;
  address: string;
  city?: string;
  eventDateTime: string;
  registrationExpiryDate: string;
  registrationType?: "paid" | "free";
  fees: number;
  offerAmount?: number;
  imageUrl: string;
  eventImages?: GeneratedContactEventImage[];
  status: "Active" | "Inactive" | "Expired";
  totalRegistrations: number;
  registrationLink: string;
}

export interface GeneratedContactEventImage {
  id: string;
  name: string;
  businessType: string;
  url: string;
  originalFileName?: string;
  uploadedAt?: string;
}

export interface GeneratedContactImportSummary {
  importId: string;
  fileName: string;
  worksheetName: string;
  uploadedDateTime: number;
  contactCount: number;
  totalCallCount: number;
  pendingCallCount: number;
  calledCount: number;
  assignedEmployeeCount: number;
  uploadType?: "EVENT" | "OTHER";
  uploadName?: string;
  eventName?: string;
}

export interface GeneratedContactDetail {
  id: string;
  excelRowNumber: number;
  name: string;
  mobile: string;
  email: string;
  city: string;
  values: Record<string, GeneratedContactCellValue>;
  assignedUserId: string;
  assignedUserName: string;
  assignedEmployeeCode: string;
  status: string;
  callStatus: "Called" | "Not Called";
  eventName?: string;
  eventCity?: string;
  eventDescription?: string;
  eventDateTime?: number;
  eventImageUrl?: string;
  eventRegistrationLink?: string;
}

export interface GeneratedContactImportDetail {
  importId: string;
  contacts: GeneratedContactDetail[];
}

export interface GeneratedContactReassignInput {
  outletId: string;
  contactId: string;
  assignedUserId: string;
  reason?: string;
}
