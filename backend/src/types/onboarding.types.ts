export interface BusinessOnboardingInput {
  ownerName: string;
  email: string;
  businessName: string;
  branch: string;
  address: string;
  city: string;
  state: string;
}

export interface OnboardingPhoneCheckInput {
  phoneNumber: string;
}

export interface OnboardingPhoneCheckResult {
  exists: boolean;
  loginMethod?: "otp" | "password";
}

export interface OnboardingAccountData {
  user: Record<string, unknown> & {
    id: string;
    uid: string;
  };
  outlet: Record<string, unknown> & {
    id: string;
  };
  teamTreeData: Array<Record<string, unknown>>;
}

export interface OnboardingResult extends OnboardingAccountData {
  customToken: string;
}

export interface PostgresOnboardingResult {
  mode: "postgres";
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  user: { id: string; email: string | null; phone: string | null; displayName: string };
  context: { tenantId: string; isTenantAdmin: boolean; outletIds: string[] };
  access: import("../modules/authorization/postgresAuthorization.repository.js").PostgresCurrentAccess;
  outlet: import("../modules/outlets/outlet.types.js").PostgresOutlet;
}

export interface OnboardingStatusResult {
  exists: boolean;
  account?: OnboardingResult | PostgresOnboardingResult;
}
