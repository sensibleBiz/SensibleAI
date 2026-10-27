import argon2 from "argon2";
import { AppError } from "../../errors/appError.js";
import { PostgresAuthRepository, type AuthRepository } from "./auth.repository.js";
import { TokenService } from "./token.service.js";
import type { AuthMembership, LoginIdentity, LoginResult } from "./auth.types.js";

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

const invalidCredentials = () => new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
const dummyHash = argon2.hash("sensible-crm-auth-timing-sentinel", ARGON2_OPTIONS);

const activeMembershipFor = (identity: LoginIdentity, tenantId?: string) =>
  identity.memberships.find((membership) => membership.active && (!tenantId || membership.tenantId === tenantId));

export class AuthService {
  constructor(
    private readonly repository: AuthRepository = new PostgresAuthRepository(),
    private readonly tokens: TokenService = new TokenService(),
  ) {}

  private async rejectWithComparableWork(password: string): Promise<never> {
    await argon2.verify(await dummyHash, password).catch(() => false);
    throw invalidCredentials();
  }

  private async verifyCredential(identity: LoginIdentity, password: string) {
    if (identity.credentialState !== "argon2id" || !identity.passwordHash) {
      throw invalidCredentials();
    }
    if (!await argon2.verify(identity.passwordHash, password).catch(() => false)) {
      throw invalidCredentials();
    }
    return identity;
  }

  private async result(identity: LoginIdentity, membership: AuthMembership): Promise<LoginResult> {
    return {
      ...await this.tokens.issue(identity.userId, membership.tenantId, identity.refreshTokenVersion),
      user: {
        id: identity.userId,
        email: identity.email,
        phone: identity.phone,
        displayName: identity.displayName,
      },
      context: {
        tenantId: membership.tenantId,
        isTenantAdmin: membership.isTenantAdmin,
        outletIds: membership.outletIds,
      },
    };
  }

  async login(identifier: string, password: string): Promise<LoginResult> {
    const normalizedIdentifier = identifier.includes("@") ? identifier.trim().toLowerCase() : identifier.trim();
    const identity = await this.repository.findByIdentifier(normalizedIdentifier);
    if (!identity) return this.rejectWithComparableWork(password);
    if (!identity.userActive) throw invalidCredentials();
    const verifiedIdentity = await this.verifyCredential(identity, password);
    const membership = activeMembershipFor(verifiedIdentity);
    if (!membership) throw invalidCredentials();
    return this.result(verifiedIdentity, membership);
  }

  async issueVerified(userId: string): Promise<LoginResult> {
    const identity = await this.repository.findByUserId(userId);
    if (!identity?.userActive) throw invalidCredentials();
    const membership = activeMembershipFor(identity);
    if (!membership) throw invalidCredentials();
    return this.result(identity, membership);
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    let claims;
    try {
      claims = await this.tokens.verify(refreshToken, "refresh");
    } catch {
      throw invalidCredentials();
    }
    const identity = await this.repository.findByUserId(claims.sub);
    if (!identity?.userActive || identity.refreshTokenVersion !== claims.ver) throw invalidCredentials();
    const membership = activeMembershipFor(identity, claims.tid);
    if (!membership) throw invalidCredentials();
    const nextVersion = await this.repository.rotateRefreshToken(identity.userId, claims.ver);
    if (nextVersion === null) throw invalidCredentials();
    return this.result({ ...identity, refreshTokenVersion: nextVersion }, membership);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const claims = await this.tokens.verify(refreshToken, "refresh");
      const identity = await this.repository.findByUserId(claims.sub);
      if (!identity?.userActive || identity.refreshTokenVersion !== claims.ver) return;
      await this.repository.rotateRefreshToken(identity.userId, claims.ver);
    } catch {
      // Logout is idempotent for absent, expired, or already-rotated cookies.
    }
  }
}

export const authService = new AuthService();
