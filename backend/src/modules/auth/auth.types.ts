export interface AuthMembership {
  tenantId: string;
  active: boolean;
  isTenantAdmin: boolean;
  outletIds: string[];
}

export interface LoginIdentity {
  userId: string;
  legacyId: string | null;
  email: string | null;
  phone: string | null;
  displayName: string;
  userActive: boolean;
  passwordHash: string | null;
  credentialState: "legacy" | "argon2id";
  refreshTokenVersion: number;
  memberships: AuthMembership[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    displayName: string;
  };
  context: {
    tenantId: string;
    isTenantAdmin: boolean;
    outletIds: string[];
  };
}
