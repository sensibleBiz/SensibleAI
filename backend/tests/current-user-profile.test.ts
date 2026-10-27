import assert from "node:assert/strict";
import test from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import {
  CurrentUserRepository,
} from "../src/modules/authorization/currentUser.repository.js";
import { CurrentUserService } from "../src/modules/authorization/currentUser.service.js";
import { currentUserProfileUpdateSchema } from "../src/modules/authorization/currentUser.validator.js";
import type { PostgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";

const database = {} as TransactionDatabase;

test("self-profile updates normalize email and accept only editable identity fields", () => {
  const parsed = currentUserProfileUpdateSchema.safeParse({
    displayName: "  Asha Patil  ",
    email: "  ASHA@EXAMPLE.COM  ",
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data, {
      displayName: "Asha Patil",
      email: "asha@example.com",
    });
  }

  assert.equal(currentUserProfileUpdateSchema.safeParse({}).success, false);
  for (const forbiddenField of ["phone", "password", "quickPin", "role", "active"]) {
    assert.equal(
      currentUserProfileUpdateSchema.safeParse({ displayName: "Asha", [forbiddenField]: "value" }).success,
      false,
    );
  }
});

test("self-profile service updates only the authenticated user and returns refreshed access", async () => {
  const calls: unknown[][] = [];
  const repository = {
    async updateProfile(...args: unknown[]) {
      calls.push(args);
      return true;
    },
  } as unknown as CurrentUserRepository;
  const expected = {
    user: { id: "user-a", email: "asha@example.com", phone: "+919876543210", displayName: "Asha" },
    tenant: { id: "tenant-a", isTenantAdmin: true },
    outlets: [],
  };
  const authorization = {
    async getCurrentAccess() {
      return expected;
    },
  } as unknown as PostgresAuthorizationRepository;
  const service = new CurrentUserService(repository, authorization);

  const result = await service.updateProfile(
    database,
    "user-a",
    "tenant-a",
    { displayName: "Asha", email: "asha@example.com" },
  );

  assert.equal(result, expected);
  assert.deepEqual(calls[0], [
    database,
    "user-a",
    { displayName: "Asha", email: "asha@example.com" },
  ]);
});

test("self-profile repository parameterizes the authenticated user update", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const transaction = {
    client: {
      async query(text: string, values: unknown[]) {
        calls.push({ text, values });
        return { rowCount: 1, rows: [{ id: "user-a" }] };
      },
    },
    db: {},
  } as unknown as TransactionDatabase;
  const repository = new CurrentUserRepository();

  assert.equal(
    await repository.updateProfile(transaction, "user-a", { displayName: "Asha" }),
    true,
  );
  assert.match(calls[0]?.text ?? "", /WHERE id = \$1 AND active/);
  assert.deepEqual(calls[0]?.values, ["user-a", "Asha", null]);
});

test("self-profile service returns a stable conflict for duplicate email", async () => {
  const repository = {
    async updateProfile() {
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    },
  } as unknown as CurrentUserRepository;
  const service = new CurrentUserService(
    repository,
    {} as PostgresAuthorizationRepository,
  );

  await assert.rejects(
    service.updateProfile(database, "user-a", "tenant-a", { email: "used@example.com" }),
    (error: unknown) => (error as { code?: string }).code === "EMAIL_ALREADY_EXISTS",
  );
});
