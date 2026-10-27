export interface CustomerRecord {
  id: string;
  /** Present on outlet-scoped API responses. Optional during rolling deploys. */
  outletId?: string;
  area: string;
  businessType: string;
  customerCode: string;
  customerName: string;
  businessName: string;
  mobile: string;
  priority: string;
  source: string;
  email: string;
  city: string;
  state: string;
  status: "ACTIVE" | "INACTIVE";
  lifecycle: "PROSPECT" | "NEW_CUSTOMER" | "REPEAT_CUSTOMER";
  totalEnquiries: number;
  totalWon: number;
  totalLost: number;
  createdDate: number;
  updatedDate: number;
}
