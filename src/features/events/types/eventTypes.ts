export type EventStatus = "Active" | "Inactive" | "Expired";

export type PaymentStatus =
  | "Paid"
  | "Pending"
  | "Failed"
  | "Free Registration";
export type EventRegistrationType = "paid" | "free";
export type EventTransactionType = "EVENT" | "OFFER";

export interface EventImageAsset {
  id: string;
  name: string;
  businessType: string;
  url: string;
  originalFileName?: string;
  uploadedAt?: string;
}

export interface EventItem {
  id: string;
  name: string;
  description: string;
  terms: string;
  location: string;
  address: string;
  city?: string;
  eventDateTime: string;
  registrationExpiryDate: string;
  registrationType?: EventRegistrationType;
  fees: number;
  offerAmount?: number;
  imageUrl: string;
  eventImages?: EventImageAsset[];
  status: EventStatus;
  totalRegistrations: number;
  registrationLink: string;
  members?: EventParticipant[];
}

export interface EventParticipant {
  id: string;
  eventId: string;
  outletId?: string;
  name: string;
  fullName?: string;
  customerName?: string;
  mobile: string;
  businessType: string;
  email?: string;
  companyName?: string;
  city?: string;
  amount: number;
  paymentStatus: PaymentStatus;
  registrationDate: string;
  paymentDate?: string | null;
  transactionId?: string;
  merchantOrderId?: string;
  transactionType?: EventTransactionType;
  transactionTitle?: string;
  registrationType?: EventRegistrationType;
  isAgreed?: boolean;
  acceptedTerms?: boolean;
  isAttended?: boolean;
}

export interface EventFormValues {
  name: string;
  description: string;
  terms: string;
  location: string;
  address: string;
  city: string;
  eventDateTime: string;
  registrationExpiryDate: string;
  registrationType?: EventRegistrationType;
  fees: number;
  offerAmount?: number;
  imageUrl: string;
  eventImages?: EventImageAsset[];
  status: EventStatus;
}

export interface EventRegistrationValues {
  fullName: string;
  mobile: string;
  businessType: string;
  email?: string;
  companyName?: string;
  city?: string;
  acceptedTerms: boolean;
}

export interface EventPaymentRequest {
  outletId: string;
  eventId: string;
  transactionId: string;
  merchantOrderId: string;
  amount: number;
  isProd: boolean;
  transactionType?: EventTransactionType;
  transactionTitle?: string;
  customerPhoneNumber: string;
  fullName?: string;
  mobile?: string;
  businessType?: string;
  email?: string;
  companyName?: string;
  city?: string;
  acceptedTerms?: boolean;
}
