import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { QrSessionService } from "../src/modules/auth/qr-session.service.js";

test("QR session migration uses a protected PostgreSQL table and bounded functions", async () => {
  const sql = await readFile(path.resolve(process.cwd(), "migrations/0017_qr_sessions.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS iam\.qr_sessions/i);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/i);
  assert.match(sql, /requested_ttl_seconds < 5 OR requested_ttl_seconds > 300/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION iam\.claim_qr_session/i);
  assert.doesNotMatch(sql, /password/i);
});

test("login creates and polls QR sessions through the API instead of Firestore", async () => {
  const source = await readFile(path.resolve(process.cwd(), "../src/features/auth/pages/Login.tsx"), "utf8");
  assert.match(source, /authApi\.createQrSession\(\)/);
  assert.match(source, /authApi\.getQrSession\(/);
  assert.doesNotMatch(source, /COLLECTION_NAME\.QR_SESSIONS/);
  assert.doesNotMatch(source, /onSnapshot\(/);
});

test("QR sessions reject duplicate or expired claims", async () => {
  const session = {
    id: "0199f2de-bc30-7000-8000-000000000001",
    isLoggedIn: false,
    userId: null,
    status: "PENDING" as const,
    createdAt: Date.now(),
    expiryAt: Date.now() + 30_000,
  };
  const repository = {
    async create() { return session; },
    async find() { return session; },
    async claim() { return false; },
  };
  const service = new QrSessionService(repository);
  await assert.rejects(
    service.claim(session.id, "profile-id"),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "QR_SESSION_UNAVAILABLE",
  );
});
