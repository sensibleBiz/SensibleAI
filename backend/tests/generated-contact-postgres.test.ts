import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("generated contact migration defines protected PostgreSQL upload storage", async () => {
  const sql = await readFile(
    path.resolve(process.cwd(), "migrations/0023_generated_contact_uploads.sql"),
    "utf8",
  );

  for (const table of [
    "generated_contact_imports",
    "generated_contacts",
    "generated_contact_assignment_history",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE crm\\.${table}`));
  }
  assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/g) ?? []).length, 3);
  assert.match(sql, /tenancy\.can_access_outlet\(tenant_id,outlet_id\)/);
  assert.match(sql, /iam\.has_outlet_permission/);
  assert.match(sql, /generated_contacts\.create/);
  assert.match(sql, /generated_contacts\.update/);
  assert.match(sql, /generated_contacts\.delete/);
  assert.match(sql, /GRANT SELECT,INSERT,UPDATE,DELETE ON crm\.generated_contact_imports/);
});

test("PostgreSQL generated contact router is mounted; legacy Firebase router removed", async () => {
  const routes = await readFile(path.resolve(process.cwd(), "src/routes/index.ts"), "utf8");
  assert.match(routes, /apiRouter\.use\("\/generated-contacts", postgresGeneratedContactRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/generated-contacts", generatedContactRouter\)/);

  const postgresSources = await Promise.all([
    "src/modules/generatedContacts/postgresGeneratedContact.routes.ts",
    "src/modules/generatedContacts/postgresGeneratedContact.controller.ts",
    "src/modules/generatedContacts/postgresGeneratedContact.service.ts",
  ].map((file) => readFile(path.resolve(process.cwd(), file), "utf8")));
  for (const source of postgresSources) {
    assert.doesNotMatch(source, /firebase|firestore/i);
  }
  assert.match(postgresSources[0]!, /POSTGRES_SESSION_HEADER/);
});
