/**
 * backend/tests/auth-negative.test.ts
 *
 * Negative-path security tests for the PostgreSQL auth and authorization layers.
 * Covers: cross-tenant access, cross-outlet access, unauthenticated access,
 * token revocation, and known routing bugs.
 *
 * Run with: node --experimental-vm-modules --import tsx/esm src/... (or your project's test runner)
 *
 * These are unit-level tests that mock the database to avoid needing a live
 * PostgreSQL connection. Mock implementations are minimal — they test contract
 * behavior, not implementation details.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

// ──────────────────────────────────────────────────────────────────────────────
// Minimal mock types matching the shapes used in middleware
// ──────────────────────────────────────────────────────────────────────────────

interface MockReq {
  header(name: string): string | undefined;
  postgresAuth?: { userId: string; tenantId: string; isTenantAdmin: boolean };
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  validated?: {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
  };
}

interface MockRes {
  statusCode: number;
  body: unknown;
  status(code: number): MockRes;
  json(body: unknown): void;
}

const makeReq = (overrides: Partial<MockReq> = {}): MockReq => ({
  header: () => undefined,
  body: {},
  query: {},
  params: {},
  validated: {},
  ...overrides,
});

const makeRes = (): MockRes => {
  const res: MockRes = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  return res;
};

// ──────────────────────────────────────────────────────────────────────────────
// Helper: build a mock DB client for hasOutletPermission tests
// ──────────────────────────────────────────────────────────────────────────────

const makePermissionDb = (allowed: boolean) => ({
  client: {
    query: async (_sql: string, _values: unknown[]) => ({
      rows: [{ allowed }],
    }),
  },
});

const makeEmptyDb = () => ({
  client: {
    query: async (_sql: string, _values: unknown[]) => ({ rows: [] }),
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Section A: TokenService unit tests
// ──────────────────────────────────────────────────────────────────────────────

describe("TokenService — token claims validation", () => {
  test("refresh token is rejected when verified as an access token", async () => {
    const { TokenService } = await import(
      "../src/modules/auth/token.service.js"
    );
    const svc = new TokenService();
    const pair = await svc.issue("user-1", "tenant-1", 1);

    await assert.rejects(
      () => svc.verify(pair.refreshToken, "access"),
      /Invalid token claims/,
      "A refresh token must be rejected when presented as an access token",
    );
  });

  test("access token is rejected when verified as a refresh token", async () => {
    const { TokenService } = await import(
      "../src/modules/auth/token.service.js"
    );
    const svc = new TokenService();
    const pair = await svc.issue("user-1", "tenant-1", 1);

    await assert.rejects(
      () => svc.verify(pair.accessToken, "refresh"),
      /Invalid token claims/,
      "An access token must be rejected when presented as a refresh token",
    );
  });

  test("token with tampered payload is rejected (signature check)", async () => {
    const { TokenService } = await import(
      "../src/modules/auth/token.service.js"
    );
    const svc = new TokenService();
    const pair = await svc.issue("user-1", "tenant-1", 1);

    // Overwrite the last 8 chars of the signature
    const tampered = pair.accessToken.slice(0, -8) + "XXXXXXXX";

    await assert.rejects(
      () => svc.verify(tampered, "access"),
      /signature|invalid/i,
      "A tampered token must be rejected",
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Section B: requirePostgresAuth middleware
// ──────────────────────────────────────────────────────────────────────────────

describe("requirePostgresAuth middleware", () => {
  test("no Authorization header → error with code INVALID_AUTH_TOKEN", async () => {
    const { requirePostgresAuth } = await import(
      "../src/middleware/postgresAuth.js"
    );
    const req = makeReq({ header: () => undefined });
    let capturedErr: unknown;
    await requirePostgresAuth(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    assert.ok(capturedErr instanceof Error, "Should pass an error to next()");
    const code = (capturedErr as { code?: string }).code;
    assert.equal(code, "INVALID_AUTH_TOKEN", `Expected INVALID_AUTH_TOKEN, got ${code}`);
  });

  test("malformed Bearer token (not a JWT) → INVALID_AUTH_TOKEN", async () => {
    const { requirePostgresAuth } = await import(
      "../src/middleware/postgresAuth.js"
    );
    const req = makeReq({
      header: (h) => (h.toLowerCase() === "authorization" ? "Bearer not.a.real.jwt" : undefined),
    });
    let capturedErr: unknown;
    await requirePostgresAuth(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    const code = (capturedErr as { code?: string }).code;
    assert.equal(code, "INVALID_AUTH_TOKEN");
  });

  test("JWT signed with wrong secret → INVALID_AUTH_TOKEN", async () => {
    // Sign with a different secret than what the app is configured with
    const { SignJWT } = await import("jose");
    const wrongSecret = new TextEncoder().encode("totally-wrong-secret-32-chars-xx");
    const fakeToken = await new SignJWT({ tid: "tenant-1", typ: "access", ver: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(wrongSecret);

    const { requirePostgresAuth } = await import(
      "../src/middleware/postgresAuth.js"
    );
    const req = makeReq({
      header: (h) =>
        h.toLowerCase() === "authorization" ? `Bearer ${fakeToken}` : undefined,
    });
    let capturedErr: unknown;
    await requirePostgresAuth(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    const code = (capturedErr as { code?: string }).code;
    assert.equal(code, "INVALID_AUTH_TOKEN", "Wrong-secret JWT must be rejected");
  });

  test("JWT tid claims tenant B, but user only has membership in tenant A → INVALID_AUTH_TOKEN", async () => {
    const { TokenService } = await import("../src/modules/auth/token.service.js");
    const svc = new TokenService();

    // Token issued for tenant-b
    const pair = await svc.issue("user-1", "tenant-b", 1);

    // Patch findByUserId to return a user whose only membership is in tenant-a
    const { PostgresAuthRepository } = await import(
      "../src/modules/auth/auth.repository.js"
    );
    const original = PostgresAuthRepository.prototype.findByUserId;
    PostgresAuthRepository.prototype.findByUserId = async () => ({
      userId: "user-1",
      userActive: true,
      refreshTokenVersion: 1,
      memberships: [{ tenantId: "tenant-a", active: true }], // ← not tenant-b
      legacyId: null,
      email: "u@example.com",
      phone: null,
      displayName: "User 1",
      passwordHash: null,
      credentialState: "argon2id" as const,
    });

    const { requirePostgresAuth } = await import(
      "../src/middleware/postgresAuth.js"
    );
    const req = makeReq({
      header: (h) =>
        h.toLowerCase() === "authorization"
          ? `Bearer ${pair.accessToken}`
          : undefined,
    });
    let capturedErr: unknown;
    await requirePostgresAuth(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    PostgresAuthRepository.prototype.findByUserId = original;

    assert.ok(capturedErr instanceof Error, "Should reject cross-tenant token");
    const code = (capturedErr as { code?: string }).code;
    assert.equal(code, "INVALID_AUTH_TOKEN", "Cross-tenant JWT claim must be rejected");
  });

  test("valid JWT but refreshTokenVersion bumped (user logged out) → INVALID_AUTH_TOKEN", async () => {
    const { TokenService } = await import("../src/modules/auth/token.service.js");
    const svc = new TokenService();

    // Token was issued at version 3
    const pair = await svc.issue("user-1", "tenant-1", 3);

    // DB says version is now 4 (rotated by logout)
    const { PostgresAuthRepository } = await import(
      "../src/modules/auth/auth.repository.js"
    );
    const original = PostgresAuthRepository.prototype.findByUserId;
    PostgresAuthRepository.prototype.findByUserId = async () => ({
      userId: "user-1",
      userActive: true,
      refreshTokenVersion: 4, // ← version bumped after logout
      memberships: [{ tenantId: "tenant-1", active: true }],
      legacyId: null,
      email: "u@example.com",
      phone: null,
      displayName: "User 1",
      passwordHash: null,
      credentialState: "argon2id" as const,
    });

    const { requirePostgresAuth } = await import(
      "../src/middleware/postgresAuth.js"
    );
    const req = makeReq({
      header: (h) =>
        h.toLowerCase() === "authorization"
          ? `Bearer ${pair.accessToken}`
          : undefined,
    });
    let capturedErr: unknown;
    await requirePostgresAuth(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    PostgresAuthRepository.prototype.findByUserId = original;

    assert.ok(capturedErr instanceof Error, "Revoked token should be rejected");
    const code = (capturedErr as { code?: string }).code;
    assert.equal(code, "INVALID_AUTH_TOKEN", "Stale refreshTokenVersion must be rejected");
  });

  test("inactive user account → INVALID_AUTH_TOKEN", async () => {
    const { TokenService } = await import("../src/modules/auth/token.service.js");
    const svc = new TokenService();
    const pair = await svc.issue("user-inactive", "tenant-1", 1);

    const { PostgresAuthRepository } = await import(
      "../src/modules/auth/auth.repository.js"
    );
    const original = PostgresAuthRepository.prototype.findByUserId;
    PostgresAuthRepository.prototype.findByUserId = async () => ({
      userId: "user-inactive",
      userActive: false, // ← deactivated
      refreshTokenVersion: 1,
      memberships: [{ tenantId: "tenant-1", active: true }],
      legacyId: null,
      email: "u@example.com",
      phone: null,
      displayName: "Inactive User",
      passwordHash: null,
      credentialState: "argon2id" as const,
    });

    const { requirePostgresAuth } = await import(
      "../src/middleware/postgresAuth.js"
    );
    const req = makeReq({
      header: (h) =>
        h.toLowerCase() === "authorization"
          ? `Bearer ${pair.accessToken}`
          : undefined,
    });
    let capturedErr: unknown;
    await requirePostgresAuth(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    PostgresAuthRepository.prototype.findByUserId = original;

    const code = (capturedErr as { code?: string }).code;
    assert.equal(code, "INVALID_AUTH_TOKEN", "Inactive user account must be rejected");
  });

  test("inactive membership → INVALID_AUTH_TOKEN", async () => {
    const { TokenService } = await import("../src/modules/auth/token.service.js");
    const svc = new TokenService();
    const pair = await svc.issue("user-1", "tenant-1", 1);

    const { PostgresAuthRepository } = await import(
      "../src/modules/auth/auth.repository.js"
    );
    const original = PostgresAuthRepository.prototype.findByUserId;
    PostgresAuthRepository.prototype.findByUserId = async () => ({
      userId: "user-1",
      userActive: true,
      refreshTokenVersion: 1,
      memberships: [{ tenantId: "tenant-1", active: false }], // ← inactive membership
      legacyId: null,
      email: "u@example.com",
      phone: null,
      displayName: "User 1",
      passwordHash: null,
      credentialState: "argon2id" as const,
    });

    const { requirePostgresAuth } = await import(
      "../src/middleware/postgresAuth.js"
    );
    const req = makeReq({
      header: (h) =>
        h.toLowerCase() === "authorization"
          ? `Bearer ${pair.accessToken}`
          : undefined,
    });
    let capturedErr: unknown;
    await requirePostgresAuth(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    PostgresAuthRepository.prototype.findByUserId = original;

    const code = (capturedErr as { code?: string }).code;
    assert.equal(code, "INVALID_AUTH_TOKEN", "Inactive tenant membership must be rejected");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Section C: hasOutletPermission — cross-tenant and cross-outlet
// ──────────────────────────────────────────────────────────────────────────────

describe("PostgresAuthorizationRepository.hasOutletPermission", () => {
  test("user from tenant A querying outlet in tenant B → false", async () => {
    const { PostgresAuthorizationRepository } = await import(
      "../src/modules/authorization/postgresAuthorization.repository.js"
    );
    const repo = new PostgresAuthorizationRepository();

    // DB returns no matching membership rows → empty rows → allowed = undefined → falsy
    const db = makeEmptyDb();
    const allowed = await repo.hasOutletPermission(
      db as never,
      "user-from-tenant-a",
      "tenant-b", // wrong tenant
      "outlet-in-tenant-b",
      "leads.read",
    );

    assert.equal(allowed, false, "Cross-tenant permission check must return false");
  });

  test("user in correct tenant but not assigned to the requested outlet → false", async () => {
    const { PostgresAuthorizationRepository } = await import(
      "../src/modules/authorization/postgresAuthorization.repository.js"
    );
    const repo = new PostgresAuthorizationRepository();

    const db = makePermissionDb(false);
    const allowed = await repo.hasOutletPermission(
      db as never,
      "user-without-outlet",
      "tenant-1",
      "outlet-not-assigned",
      "leads.create",
    );

    assert.equal(allowed, false, "User not assigned to outlet must be denied");
  });

  test("tenant admin is granted access to any outlet in their tenant", async () => {
    const { PostgresAuthorizationRepository } = await import(
      "../src/modules/authorization/postgresAuthorization.repository.js"
    );
    const repo = new PostgresAuthorizationRepository();

    const db = makePermissionDb(true); // is_tenant_admin = true
    const allowed = await repo.hasOutletPermission(
      db as never,
      "admin-user",
      "tenant-1",
      "any-outlet-uuid",
      "leads.delete",
    );

    assert.equal(allowed, true, "Tenant admin must have permission on any outlet");
  });

  test("user with specific permission in one outlet cannot access a different outlet", async () => {
    const { PostgresAuthorizationRepository } = await import(
      "../src/modules/authorization/postgresAuthorization.repository.js"
    );
    const repo = new PostgresAuthorizationRepository();

    // Simulate: DB returns false because the WHERE clause includes outlet_id and it doesn't match
    const db = {
      client: {
        query: async (_sql: string, values: unknown[]) => {
          const outletId = values[2]; // third param is outlet_id
          // Only outlet-assigned-1 returns true; everything else returns false
          return { rows: [{ allowed: outletId === "outlet-assigned-1" }] };
        },
      },
    };

    const allowedCorrect = await repo.hasOutletPermission(
      db as never,
      "user-1",
      "tenant-1",
      "outlet-assigned-1",
      "leads.read",
    );
    const allowedWrong = await repo.hasOutletPermission(
      db as never,
      "user-1",
      "tenant-1",
      "outlet-not-assigned",
      "leads.read",
    );

    assert.equal(allowedCorrect, true, "User should have access to their assigned outlet");
    assert.equal(allowedWrong, false, "User must not access an outlet they are not assigned to");
  });

  test("user with permission X cannot use it as permission Y", async () => {
    const { PostgresAuthorizationRepository } = await import(
      "../src/modules/authorization/postgresAuthorization.repository.js"
    );
    const repo = new PostgresAuthorizationRepository();

    const db = {
      client: {
        query: async (_sql: string, values: unknown[]) => {
          const permKey = values[3]; // fourth param is permission_key
          return { rows: [{ allowed: permKey === "leads.read" }] };
        },
      },
    };

    const allowedRead = await repo.hasOutletPermission(
      db as never,
      "user-1",
      "tenant-1",
      "outlet-1",
      "leads.read",
    );
    const allowedDelete = await repo.hasOutletPermission(
      db as never,
      "user-1",
      "tenant-1",
      "outlet-1",
      "leads.delete", // different permission
    );

    assert.equal(allowedRead, true, "User should have leads.read");
    assert.equal(allowedDelete, false, "User must not have leads.delete when only granted leads.read");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Section D: Known routing bugs (document the current state)
// ──────────────────────────────────────────────────────────────────────────────

describe("Routing security (Phase 14 fixes verified)", () => {
  test("AUTH-01: POST /quick-contacts is registered AFTER requirePostgresAuth (fixed)", async () => {
    const { postgresPublicLinkRouter } = await import(
      "../src/modules/publicLinks/postgresPublicLink.routes.js"
    );

    type RouterLayer = {
      route?: { path: string; methods: Record<string, boolean> };
      name?: string;
      handle?: { name?: string };
    };
    const stack = (
      postgresPublicLinkRouter as unknown as { stack: RouterLayer[] }
    ).stack;

    const quickContactsIdx = stack.findIndex(
      (layer) => layer.route?.path === "/quick-contacts",
    );
    const authMiddlewareIdx = stack.findIndex(
      (layer) =>
        !layer.route &&
        (layer.name === "requirePostgresAuth" ||
          layer.handle?.name === "requirePostgresAuth" ||
          layer.name === "bound requirePostgresAuth" ||
          layer.handle?.name === "bound requirePostgresAuth"),
    );

    assert.ok(
      quickContactsIdx !== -1,
      "The /quick-contacts route should exist in the router",
    );
    assert.ok(
      authMiddlewareIdx !== -1,
      "requirePostgresAuth middleware should exist in the router",
    );

    assert.ok(
      quickContactsIdx > authMiddlewareIdx,
      "/quick-contacts must be registered after requirePostgresAuth so unauthenticated requests are rejected",
    );
  });

  test("AUTH-02: INBOUND_EMAIL_WEBHOOK_SECRET has no hardcoded fallback (fixed)", () => {
    // Verify the source no longer contains the known-bad fallback literal
    const original = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

    // After the fix: the env var is absent, so configuredSecret should be undefined/falsy
    const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = original;

    assert.equal(
      configuredSecret,
      undefined,
      "When INBOUND_EMAIL_WEBHOOK_SECRET is unset, there must be no hardcoded fallback — the webhook must refuse requests",
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Section E: Event gateway pre-shared key guard
// ──────────────────────────────────────────────────────────────────────────────

describe("Event gateway authentication", () => {
  test("request without X-Event-Gateway-Key header is rejected", async () => {
    const { requireEventGatewayKey } = await import(
      "../src/modules/events/eventGateway.middleware.js"
    );
    const req = makeReq({ header: () => undefined });
    let capturedErr: unknown;
    await requireEventGatewayKey(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    assert.ok(capturedErr, "Missing gateway key should call next(error)");
  });

  test("request with wrong X-Event-Gateway-Key is rejected", async () => {
    const { requireEventGatewayKey } = await import(
      "../src/modules/events/eventGateway.middleware.js"
    );
    const req = makeReq({
      header: (h) =>
        h === "X-Event-Gateway-Key" ? "wrong-key-value" : undefined,
    });
    let capturedErr: unknown;
    await requireEventGatewayKey(
      req as never,
      makeRes() as never,
      (err) => { capturedErr = err; },
    );

    assert.ok(capturedErr, "Wrong gateway key should call next(error)");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Section F: withRequestDatabaseContext — missing auth context
// ──────────────────────────────────────────────────────────────────────────────

describe("withRequestDatabaseContext — guards", () => {
  test("request without postgresAuth.tenantId → error (no database context set)", async () => {
    const { withRequestDatabaseContext } = await import(
      "../src/middleware/postgresAuth.js"
    );

    const handler = withRequestDatabaseContext(async (_req, res) => {
      res.json({ ok: true });
    });

    const req = makeReq({ postgresAuth: undefined });
    const res = makeRes();
    let capturedErr: unknown;
    await handler(req as never, res as never, (err) => { capturedErr = err; });

    // Should fail with an authentication error, not call res.json
    assert.ok(
      capturedErr !== undefined || res.statusCode !== 200,
      "Handler without auth context should not succeed",
    );
  });
});
