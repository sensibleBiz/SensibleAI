export interface QrSession {
  id: string;
  isLoggedIn: boolean;
  userId: string | null;
  status: "PENDING" | "CLAIMED" | "EXPIRED";
  expiryAt: number; // timestamp (ms)
  createdAt: number;
}
