export interface EventMemberInput {
  name?: string;
  mobile?: string;
  paymentStatus?: string;
  businessType?: string;
  email?: string;
  companyName?: string;
  city?: string;
  paymentDate?: string | Date | null;
  isAgreed?: boolean;
  isAttended?: boolean;
  amount?: number;
  transactionId?: string;
  transactionTitle?: string;
  transactionType?: string;
  url?: string;
}
