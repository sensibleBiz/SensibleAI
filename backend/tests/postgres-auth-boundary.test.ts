import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SignJWT } from "jose";
import { env } from "../src/config/env.js";
import type { TransactionDatabase } from "../src/db/context.js";
import {
  clearRefreshCookie,
  POSTGRES_REFRESH_COOKIE,
  readRefreshCookie,
  setRefreshCookie,
} from "../src/modules/auth/auth.cookie.js";
import { TokenService } from "../src/modules/auth/token.service.js";
import { PostgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";

env.jwt.accessSecret = "phase-a-access-secret-that-is-at-least-32-characters";
env.jwt.refreshSecret = "phase-a-refresh-secret-that-is-at-least-32-characters";

test("PostgreSQL auth boundary has no Firebase or Firestore dependency", async () => {
  const sources = await Promise.all([
    "src/modules/auth/auth.service.ts",
    "src/middleware/postgresAuth.ts",
    "src/modules/authorization/postgresAuthorization.repository.ts",
    "src/modules/authorization/currentUser.controller.ts",
  ].map((file) => readFile(file, "utf8")));
  const combined = sources.join("\n").toLowerCase();
  assert.doesNotMatch(combined, /firebase|firestorelegacy|config\/firebase/);
});

test("frontend keeps PostgreSQL and legacy auth explicit and coalesces refresh", async () => {
  const [sessionManager, apiClient] = await Promise.all([
    readFile("../src/shared/api/postgresSession.ts", "utf8"),
    readFile("../src/shared/api/apiClient.ts", "utf8"),
  ]);
  assert.match(sessionManager, /if \(refreshPromise\) return refreshPromise/);
  assert.match(sessionManager, /credentials: "include"/);
  assert.match(apiClient, /"postgres" \| "firebase" \| "none"/);
  assert.match(apiClient, /authMode === "postgres"/);
});

test("refresh cookie is HttpOnly and can be read and cleared", () => {
  const writes: Array<{ name: string; value?: string; options: Record<string, unknown> }> = [];
  const response = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      writes.push({ name, value, options });
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      writes.push({ name, options });
    },
  };
  setRefreshCookie(response as never, "refresh-value", 60);
  clearRefreshCookie(response as never);
  assert.equal(writes[0]?.name, POSTGRES_REFRESH_COOKIE);
  assert.equal(writes[0]?.options.httpOnly, true);
  assert.equal(writes[0]?.options.path, "/api/v1");
  assert.equal(writes[0]?.options.maxAge, 60_000);
  assert.equal(writes[1]?.name, POSTGRES_REFRESH_COOKIE);
  assert.equal(writes[1]?.options.path, "/api/v1");
  assert.equal(readRefreshCookie({ headers: { cookie: `${POSTGRES_REFRESH_COOKIE}=refresh-value` } } as never), "refresh-value");
  assert.equal(readRefreshCookie({ headers: { cookie: `${POSTGRES_REFRESH_COOKIE}=%E0%A4%A` } } as never), undefined);
});

test("access tokens reject expiry and invalid signatures", async () => {
  const expired = await new SignJWT({ tid: "tenant", typ: "access", ver: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user")
    .setIssuer(env.jwt.issuer)
    .setAudience(env.jwt.audience)
    .setExpirationTime("0s")
    .sign(new TextEncoder().encode(env.jwt.accessSecret));
  const invalid = await new SignJWT({ tid: "tenant", typ: "access", ver: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user")
    .setIssuer(env.jwt.issuer)
    .setAudience(env.jwt.audience)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode("a-different-secret-that-is-long-enough"));
  const tokens = new TokenService();
  await assert.rejects(tokens.verify(expired, "access"));
  await assert.rejects(tokens.verify(invalid, "access"));
});

test("PostgreSQL authorization maps tenant, outlet, role, and permissions", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const database = {
    client: {
      async query(text: string, values: unknown[]) {
        calls.push({ text, values });
        return { rows: [{
          user_id: "user-a", email: "a@example.com", phone: null,
          display_name: "User A", is_tenant_admin: false,
          outlet_id: "outlet-a", outlet_name: "Outlet A",
          business_id: "business-a", business_name: "Business A",
          role_id: "role-a", role_name: "seller",
          permissions: ["outlets.read"],
        }] };
      },
    },
    db: {},
  } as unknown as TransactionDatabase;
  const repository = new PostgresAuthorizationRepository();
  const result = await repository.getCurrentAccess(database, "user-a", "tenant-a");
  assert.equal(result.tenant.id, "tenant-a");
  assert.equal(result.outlets[0]?.roleName, "seller");
  assert.deepEqual(result.outlets[0]?.permissions, ["outlets.read"]);
  assert.deepEqual(calls[0]?.values, ["user-a", "tenant-a"]);
  assert.match(calls[0]?.text ?? "", /tenant_memberships/);
  assert.match(calls[0]?.text ?? "", /role_permissions/);
});
