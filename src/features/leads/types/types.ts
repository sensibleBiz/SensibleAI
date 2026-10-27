type TimestampValue = { seconds: number; nanoseconds?: number; toMillis?: () => number };

export interface LeadTag {
  code: number;
  leadTagName: string;
  type: string;
}

export interface LeadActivity {
  id: string;

  // References
  assignedTo: string; // User ID or reference string
  leadRefId: string; // Reference to a lead document

  // Lead Info
  leadName: string;
  leadMobile?: string;
  leadRequirement?: string;

  // Activity Details
  description: string;
  mode: string; // e.g., "Offline", "Online"
  type: string; // e.g., "Follow Up"
  status: string; // e.g., "PENDING", "DONE"

  // Date & Time
  createdDate: TimestampValue;
  createdDateInMill: number; // milliseconds since epoch
  scheduledDate: number; // milliseconds since epoch
  scheduledTime: number; // milliseconds since epoch
}

export interface LeadStage {
  id: string;
  code: number;
  name: string; // e.g. "lost"
  display: string; // e.g. "LOST"
  tabColor: string; // e.g. "#b22828"
  isActive: boolean;
  isDeleted: boolean;
}

export interface LeadTag {
  code: number;
  isDeleted: boolean;
  leadTagName: string;
  type: string;
}

export interface AssignHistoryEntry {
  assignTo: string;
  assignBy: string;
  assignAt: number; // timestamp in ms
}

export interface LeadsManagement {
  assignedHistory?: AssignHistoryEntry[];
  adId?: string;
  area: string;
  assignedBy: string;
  assignedTo: string;
  businessName: string;
  businessType: string;
  city: string;
  comments: string;
  createdDate: number;
  customerId?: string | null;
  customerType?: "PROSPECT" | "CUSTOMER";
  date: string;
  email: string;
  enquiryType?: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  followUpName: string;
  id: string;
  isCustomer: boolean;
  isDealerLead: boolean;
  isDuplicate: boolean;
  leadCreatedDate: number;
  leadDate: string;
  leadRefId: string;
  leadCampaign?: string;
  leadTag: string[];
  logId: number;
  mobile: string;
  mobileAlt: string;
  phone: string;
  priority: string;
  remarks: string;
  requirement: string;
  source: string;
  stage: string;
  state: string;
  status: string;
  time: string;
  updatedDate: number;
  username: string;
  whatsappShareCount?: number;
  customFields?: Record<string, unknown>;
}

export interface QuotationRecord {
  id?: string;
  quotationNo: string;
  leadId: string;
  leadName: string;
  leadMobile: string;
  assignedTo: string;
  source: string;
  sentAt: number;
  sentBy: string;
  pdfUrl: string;
  itemCount: number;
  totalAmount: number;
  status: "SENT";
}

export interface outletLeads {
  area: string;
  assignedBy: string;
  assignedTo: string;
  businessName: string;
  businessType: string;
  city: string;
  comments: string;
  createdDate: number;
  customerId?: string | null;
  customerType?: "PROSPECT" | "CUSTOMER";
  date: string;
  email: string;
  enquiryType?: "NEW_LEAD" | "CUSTOMER_ENQUIRY";
  followUpName: string;
  id: string;
  isCustomer: boolean;
  isDealerLead: boolean;
  isDuplicate: boolean;
  leadCreatedDate: number;
  leadDate: string;
  leadRefId: string;
  leadTag: LeadTag[];
  logId: number;
  mobile: string;
  mobileAlt: string;
  phone: string;
  priority: string;
  remarks: string;
  requirement: string;
  source: string;
  stage: string;
  state: string;
  status: string;
  time: string;
  updatedDate: number;
  username: string;
}
