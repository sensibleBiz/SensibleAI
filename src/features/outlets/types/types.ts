type EntityReference = { id?: string; path?: string } | string;
type GeoPointValue = { latitude: number; longitude: number };

export interface Outlet {
  active: boolean;
  address: string;
  billingType: string;
  branch: string;
  businessMaster: EntityReference;
  businessId?: string;
  businessName?: string;
  city: string;
  createdBy: EntityReference;
  createdDate: number;
  eraseOutlet: boolean;
  id: string;
  latLang: GeoPointValue;
  name: string;
  renewalDate: number;
  state: string;
}

export interface ModuleSubscription {
  id: string;
  activeUserIds?: string[];
  amount?: number;
  createdDate?: number;
  duration?: number;
  featureKey?: string;
  isActive?: boolean;
  name?: string;
  permittedUsers?: number;
  renewalDate?: number;
  transactionId?: string;
  updatedDate?: number;
  updatedBy?: string;
}
