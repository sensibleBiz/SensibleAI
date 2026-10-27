export interface PostgresOutlet {
  id: string;
  businessId: string;
  businessName: string;
  outletCode: string;
  name: string;
  branch: string;
  address: string;
  city: string;
  state: string;
  billingType: string;
  renewalDate: number;
  active: boolean;
  createdDate: number;
  createdBy: string;
  businessMaster: string;
  eraseOutlet: boolean;
  latLang: { latitude: number; longitude: number };
}

export interface PostgresOutletCreateInput {
  businessId?: string;
  name: string;
  branch: string;
  address: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
}

export interface OutletSubscription {
  id: string;
  outletId: string;
  planTier: "trial" | "silver" | "gold" | "platinum";
  status: "trial" | "active" | "expired" | "cancelled";
  amount: number;
  permittedUsers: number;
  startsAt: number;
  renewsAt: number;
  externalTransactionId: string | null;
}
