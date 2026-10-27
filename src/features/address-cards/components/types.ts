export interface AddressRecord {
  id: string;
  name: string;
  company: string;
  fullAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  mobile: string;
  category: string;
  source: string;
  selected: boolean;
  possibleDuplicate?: boolean;
}

export type AddressField =
  | "name"
  | "company"
  | "fullAddress"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "pincode"
  | "mobile"
  | "category"
  | "source";
export type AddressOrientation = "portrait" | "landscape";
export type AddressTextAlignment = "left" | "center";

export interface AddressCardSettings {
  showMobile: boolean;
  showBorder: boolean;
  showCategory: boolean;
  showCitySeparately: boolean;
  showSource: boolean;
  fontSize: number;
  textAlign: AddressTextAlignment;
  paddingMm: number;
  orientation: AddressOrientation;
}
