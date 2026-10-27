export type TicketStatus =
  | "New"
  | "Pending"
  | "Resolved";

export type TicketPriority = "Low" | "Medium" | "High" | "Urgent";

export type SendeskAgent = {
  userProfileId: string;
  userName: string;
  department: string;
};

export type SendeskTicket = {
  id: string;
  ticketNo: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  deviceId?: string;
  outletId?: string;
  outletNameId?: string;
  issueTitle: string;
  issueDescription: string;
  issueCategory: string;
  priority: TicketPriority;
  status: TicketStatus;
  source: string;
  assignedTo: string | null;
  attachmentName?: string;
  attachments?: {
    name: string;
    url: string;
    isImage: boolean;
  }[];
  lastUpdateMessage: string;
  createdAt: string;
  createdAtTimestamp?: number;
  resolvedAtTimestamp?: number;
  comments: {
    id: string;
    by: string;
    message: string;
    createdAt: string;
  }[];
};

export const getStatusColor = (status: TicketStatus) => {
  switch (status) {
    case "New":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "Pending":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Resolved":
      return "bg-green-100 text-green-700 border-green-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

export const getPriorityColor = (priority: TicketPriority) => {
  switch (priority) {
    case "Urgent":
      return "bg-red-100 text-red-700 border-red-200";
    case "High":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "Medium":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Low":
      return "bg-green-100 text-green-700 border-green-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};
