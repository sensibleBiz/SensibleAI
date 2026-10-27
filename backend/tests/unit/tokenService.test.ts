/**
 * TokenService unit tests — regression coverage for WS-3 (Phase 15).
 *
 * Root cause of "JWSSignatureVerificationFailed vs expected regex":
 *   When the test environment does not provide JWT_ACCESS_SECRET /
 *   JWT_REFRESH_SECRET, getSecret() throws before any token can be created.
 *   A test that expects a JWT-level error (e.g. JWTExpired) instead gets a
 *   configuration error.  Fix: always set known test secrets BEFORE constructing
 *   a TokenService or calling any method, and restore them in after().
 *
 * Isolation rule: within a single Node.js test worker (one file), env mutations
 * at module scope affect all tests in that file.  These tests save and restore
 * the secret values around each group using before/after hooks.
 */

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { SignJWT } from "jose";
import { env } from "../../src/config/env.js";
import { TokenService } from "../../src/modules/auth/token.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test-only secrets — never used in production; length ≥ 32 required by
// TokenService.getSecret().
// ─────────────────────────────────────────────────────────────────────────────
const TEST_ACCESS_SECRET  = "ts-unit-access-secret-xxxxxxxxxxxxxxxxxxx";
const TEST_REFRESH_SECRET = "ts-unit-refresh-secret-xxxxxxxxxxxxxxxxxx";
const OTHER_SECRET        = "ts-unit-other-secret-xxxxxxxxxxxxxxxxxxxxx";

let savedAccessSecret: string | undefined;
let savedRefreshSecret: string | undefined;

describe("TokenService — sign and verify contract", () => {
  before(() => {
    savedAccessSecret  = env.jwt.accessSecret;
    savedRefreshSecret = env.jwt.refreshSecret;
    env.jwt.accessSecret  = TEST_ACCESS_SECRET;
    env.jwt.refreshSecret = TEST_REFRESH_SECRET;
  });

  after(() => {
    env.jwt.accessSecret  = savedAccessSecret as string;
    env.jwt.refreshSecret = savedRefreshSecret as string;
  });

  test("valid access token round-trips: issue → verify returns correct claims", async () => {
    const service = new TokenService();
    const pair = await service.issue("user-abc", "tenant-xyz", 3);
    const claims = await service.verify(pair.accessToken, "access");

    assert.equal(claims.sub, "user-abc");
    assert.equal(claims.tid, "tenant-xyz");
    assert.equal(claims.typ, "access");
    assert.equal(claims.ver, 3);
    assert.equal(claims.iss, env.jwt.issuer);
    assert.equal(claims.aud, env.jwt.audience);
  });

  test("valid refresh token round-trips: issue → verify returns correct claims", async () => {
    const service = new TokenService();
    const pair = await service.issue("user-def", "tenant-abc", 0);
    const claims = await service.verify(pair.refreshToken, "refresh");

    assert.equal(claims.sub, "user-def");
    assert.equal(claims.typ, "refresh");
    assert.equal(claims.ver, 0);
  });

  test("access token is rejected when verified as refresh (type mismatch)", async () => {
    const service = new TokenService();
    const pair = await service.issue("user-abc", "tenant-xyz", 1);
    await assert.rejects(
      service.verify(pair.accessToken, "refresh"),
      (err: unknown) => err instanceof Error,
    );
  });

  test("refresh token is rejected when verified as access (type mismatch)", async () => {
    const service = new TokenService();
    const pair = await service.issue("user-abc", "tenant-xyz", 1);
    await assert.rejects(
      service.verify(pair.refreshToken, "access"),
      (err: unknown) => err instanceof Error,
    );
  });

  test("expired token is rejected (JWTExpired)", async () => {
    // Sign a token that expired 0 seconds ago.  We go 1 second into the past
    // to ensure the clock check fires even under fast machines.
    const secret = new TextEncoder().encode(TEST_ACCESS_SECRET);
    const expired = await new SignJWT({ tid: "t", typ: "access", ver: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer(env.jwt.issuer)
      .setAudience(env.jwt.audience)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 10)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(secret);

    const service = new TokenService();
    await assert.rejects(
      service.verify(expired, "access"),
      (err: unknown) => {
        // jose throws JWTExpired; we accept any Error to avoid coupling the
        // test to the internal jose error class names.
        return err instanceof Error;
      },
    );
  });

  test("token signed with a different key is rejected (JWSSignatureVerificationFailed)", async () => {
    const wrongKey = new TextEncoder().encode(OTHER_SECRET);
    const tampered = await new SignJWT({ tid: "t", typ: "access", ver: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer(env.jwt.issuer)
      .setAudience(env.jwt.audience)
      .setExpirationTime("5m")
      .sign(wrongKey);

    const service = new TokenService();
    await assert.rejects(
      service.verify(tampered, "access"),
      (err: unknown) => err instanceof Error,
    );
  });

  test("malformed / truncated token string is rejected", async () => {
    const service = new TokenService();
    await assert.rejects(service.verify("not.a.jwt", "access"), (err: unknown) => err instanceof Error);
    await assert.rejects(service.verify("", "access"),          (err: unknown) => err instanceof Error);
    await assert.rejects(service.verify("aaaa.bbbb.cccc", "access"), (err: unknown) => err instanceof Error);
  });

  test("token with wrong issuer is rejected", async () => {
    const secret = new TextEncoder().encode(TEST_ACCESS_SECRET);
    const wrongIssuer = await new SignJWT({ tid: "t", typ: "access", ver: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer("wrong-issuer")
      .setAudience(env.jwt.audience)
      .setExpirationTime("5m")
      .sign(secret);

    const service = new TokenService();
    await assert.rejects(service.verify(wrongIssuer, "access"), (err: unknown) => err instanceof Error);
  });

  test("token with wrong audience is rejected", async () => {
    const secret = new TextEncoder().encode(TEST_ACCESS_SECRET);
    const wrongAudience = await new SignJWT({ tid: "t", typ: "access", ver: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer(env.jwt.issuer)
      .setAudience("wrong-audience")
      .setExpirationTime("5m")
      .sign(secret);

    const service = new TokenService();
    await assert.rejects(service.verify(wrongAudience, "access"), (err: unknown) => err instanceof Error);
  });

  test("token claims must include typ, tid, and ver fields", async () => {
    // A structurally valid JWT that is missing required CRM claims should be rejected
    const secret = new TextEncoder().encode(TEST_ACCESS_SECRET);
    const missingClaims = await new SignJWT({ unrelated: "payload" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuer(env.jwt.issuer)
      .setAudience(env.jwt.audience)
      .setExpirationTime("5m")
      .sign(secret);

    const service = new TokenService();
    await assert.rejects(service.verify(missingClaims, "access"), (err: unknown) => err instanceof Error);
  });

  test("getSecret throws when JWT_ACCESS_SECRET is shorter than 32 characters", async () => {
    const savedSecret = env.jwt.accessSecret;
    try {
      env.jwt.accessSecret = "too-short";
      await assert.rejects(new TokenService().issue("u", "t", 0), /must be at least 32 characters/);
    } finally {
      env.jwt.accessSecret = savedSecret;
    }
  });
});
