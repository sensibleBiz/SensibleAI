import assert from "node:assert/strict";
import { test } from "node:test";
import argon2 from "argon2";
import { env } from "../src/config/env.js";
import { AppError } from "../src/errors/appError.js";
import type { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { ARGON2_OPTIONS, AuthService } from "../src/modules/auth/auth.service.js";
import type { LoginIdentity } from "../src/modules/auth/auth.types.js";
import { TokenService } from "../src/modules/auth/token.service.js";

env.jwt.accessSecret = "test-access-secret-that-is-at-least-32-characters";
env.jwt.refreshSecret = "test-refresh-secret-that-is-at-least-32-characters";

const membership = {
  tenantId: "01994abc-1234-7abc-8abc-1234567890ab",
  active: true,
  isTenantAdmin: false,
  outletIds: ["01994abc-1234-7abc-8abc-1234567890ac"],
};

const createIdentity = (overrides: Partial<LoginIdentity> = {}): LoginIdentity => ({
  userId: "01994abc-1234-7abc-8abc-1234567890aa",
  legacyId: "firestore-user-1",
  email: "person@example.com",
  phone: "+919999999999",
  displayName: "Test Person",
  userActive: true,
  passwordHash: null,
  credentialState: "legacy",
  refreshTokenVersion: 0,
  memberships: [membership],
  ...overrides,
});

class MemoryAuthRepository implements AuthRepository {
  public upgradedHashes: string[] = [];
  constructor(public identity: LoginIdentity | null) {}
  async findByIdentifier() { return this.identity; }
  async findByUserId(userId: string) { return this.identity?.userId === userId ? this.identity : null; }
  async upgradeLegacyCredential(_userId: string, passwordHash: string) {
    if (!this.identity || this.identity.credentialState !== "legacy") return false;
    this.upgradedHashes.push(passwordHash);
    this.identity = { ...this.identity, passwordHash, credentialState: "argon2id" };
    return true;
  }
  async rotateRefreshToken(_userId: string, expectedVersion: number) {
    if (!this.identity || this.identity.refreshTokenVersion !== expectedVersion) return null;
    const nextVersion = expectedVersion + 1;
    this.identity = { ...this.identity, refreshTokenVersion: nextVersion };
    return nextVersion;
  }
}

const expectGeneric401 = async (operation: Promise<unknown>) => {
  await assert.rejects(operation, (error: unknown) =>
    error instanceof AppError && error.statusCode === 401 && error.code === "INVALID_CREDENTIALS" && error.message === "Invalid credentials",
  );
};

test("Argon2id login succeeds and invalid credentials remain generic", async () => {
  const hash = await argon2.hash("correct-password", ARGON2_OPTIONS);
  const repository = new MemoryAuthRepository(createIdentity({ passwordHash: hash, credentialState: "argon2id" }));
  const service = new AuthService(repository, new TokenService());

  const result = await service.login("PERSON@EXAMPLE.COM", "correct-password");
  assert.equal(result.context.tenantId, membership.tenantId);
  assert.deepEqual(result.context.outletIds, membership.outletIds);
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  await expectGeneric401(service.login("person@example.com", "wrong-password"));

  const missing = new AuthService(new MemoryAuthRepository(null), new TokenService());
  await expectGeneric401(missing.login("nobody@example.com", "wrong-password"));
});

test("inactive users and inactive memberships are rejected", async () => {
  const hash = await argon2.hash("correct-password", ARGON2_OPTIONS);
  await expectGeneric401(new AuthService(
    new MemoryAuthRepository(createIdentity({ userActive: false, passwordHash: hash, credentialState: "argon2id" })),
  ).login("person@example.com", "correct-password"));
  await expectGeneric401(new AuthService(
    new MemoryAuthRepository(createIdentity({ passwordHash: hash, credentialState: "argon2id", memberships: [{ ...membership, active: false }] })),
  ).login("person@example.com", "correct-password"));
});

test("legacy credential state is rejected without migration or an external lookup", async () => {
  const repository = new MemoryAuthRepository(createIdentity());
  const service = new AuthService(repository, new TokenService());
  await expectGeneric401(service.login("person@example.com", "legacy-password"));
  assert.equal(repository.upgradedHashes.length, 0);
});

test("refresh tokens are type checked and current membership is revalidated", async () => {
  const hash = await argon2.hash("correct-password", ARGON2_OPTIONS);
  const repository = new MemoryAuthRepository(createIdentity({ passwordHash: hash, credentialState: "argon2id" }));
  const service = new AuthService(repository, new TokenService());
  const login = await service.login("person@example.com", "correct-password");
  const refreshed = await service.refresh(login.refreshToken);
  assert.equal(refreshed.context.tenantId, membership.tenantId);
  await expectGeneric401(service.refresh(login.refreshToken));
  await expectGeneric401(service.refresh(login.accessToken));
  repository.identity = createIdentity({ passwordHash: hash, credentialState: "argon2id", memberships: [{ ...membership, active: false }] });
  await expectGeneric401(service.refresh(login.refreshToken));
});

test("logout rotates the refresh-token version and invalidates the cookie token", async () => {
  const hash = await argon2.hash("correct-password", ARGON2_OPTIONS);
  const repository = new MemoryAuthRepository(createIdentity({ passwordHash: hash, credentialState: "argon2id" }));
  const service = new AuthService(repository, new TokenService());
  const login = await service.login("person@example.com", "correct-password");
  await service.logout(login.refreshToken);
  await expectGeneric401(service.refresh(login.refreshToken));
});
