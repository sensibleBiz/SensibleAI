---
name: new-migration
description: Add a PostgreSQL migration or new table to the backend (hand-written SQL, Drizzle schema, journal entry, RLS and grants). Use whenever creating or altering tables, schemas, policies, or grants.
---

# New migration

1. **Schema code.** Update or add the Drizzle definition in `backend/src/db/schema/<area>.ts` and export it from `schema/index.ts`. Tables are spread over several Postgres schemas (tenancy, iam, crm, billing, accounts, exports, …). Put the table in the one that fits.

2. **SQL file.** Write the SQL by hand as `backend/migrations/NNNN_<name>.sql`, where NNNN is the next number in sequence. Add `NNNN_<name>_rollback.sql` next to it when the change can be reversed.

3. **Journal.** Add an entry to `backend/migrations/meta/_journal.json`:
   - `idx` = the previous entry's idx + 1
   - `tag` = the file name without `.sql`
   - `when` = later than the previous entry
   - `version: "7"`, `breakpoints: true`

   Don't add rollback files to the journal. `tests/migration-journal.test.ts` checks the journal.

4. **Grants and RLS for every new table:**
   - `GRANT` the needed privileges to `sensible_app_role`. A new schema also needs `GRANT USAGE ON SCHEMA` to `sensible_app_role` and `sensible_rls_owner`.
   - `ALTER TABLE … ENABLE ROW LEVEL SECURITY;`
   - Add tenant policies keyed on `current_setting('app.current_tenant_id')`. Copy the pattern from a recent migration such as `0049_accounts_and_exports_suite.sql`.
   - Missing grants are a known past mistake. `0019_call_table_grants.sql` and `0024_payroll_table_grants.sql` exist only to fix them.

5. **Seeded permission rows.** Migrations run with `app.is_super_admin = true` (see `src/db/migrate.ts`), so inserts that RLS would otherwise block work there. Don't rely on that in application code.

6. **Verify** from `backend/`:
   ```bash
   npm run db:migrate
   npm run typecheck && npm test
   ```
   For billing or RLS-sensitive changes, also run `npm run test:integration`, which needs `DATABASE_ADMIN_URL`.
