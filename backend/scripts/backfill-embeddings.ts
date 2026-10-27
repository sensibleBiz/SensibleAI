import "../src/config/env.js";
import { env } from "../src/config/env.js";
import pg from "pg";
import { embedText, leadEmbeddingText } from "../src/modules/assistant/tools/embeddingService.js";

const adminUrl = env.database.adminUrl;
if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is not set");

const pool = new pg.Pool({ connectionString: adminUrl });

// Step 1: get tenant + user without RLS (SET is session-scope, bypasses transaction RLS for non-transactional queries)
const infoClient = await pool.connect();
await infoClient.query("SET app.is_super_admin = 'true'");
await infoClient.query("SET app.current_tenant_id = '00000000-0000-0000-0000-000000000000'");
await infoClient.query("SET app.current_user_id = '00000000-0000-0000-0000-000000000000'");

const { rows: tenants } = await infoClient.query<{ id: string; name: string }>(
  `SELECT id, name FROM tenancy.tenants`,
);
const { rows: users } = await infoClient.query<{ id: string; email: string }>(
  `SELECT id, email FROM iam.users LIMIT 1`,
);

// Also check total lead count
const { rows: rawCount } = await infoClient.query(
  `SELECT COUNT(*) AS n, COUNT(embedding) AS with_emb FROM crm.leads`,
);
console.log(`Tenants: ${tenants.map((t) => t.name).join(", ")}`);
console.log(`Users: ${users.map((u) => u.email).join(", ")}`);
console.log(`crm.leads total: ${rawCount[0].n}, with_embedding: ${rawCount[0].with_emb}`);
infoClient.release();

if (tenants.length === 0) {
  console.error("No tenants visible — check RLS / DB connection");
  await pool.end();
  process.exit(1);
}

const tenantId = tenants[0].id;
const userId = users[0].id;

// Step 2: backfill using set_config (transaction-scoped) with real IDs
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
  await client.query("SELECT set_config('app.is_super_admin', 'true', true)");

  const { rows } = await client.query<{
    id: string;
    business_name: string | null;
    requirement: string | null;
    source: string | null;
    city: string | null;
    state: string | null;
  }>(`SELECT id, business_name, requirement, source, city, state FROM crm.leads WHERE embedding IS NULL`);

  console.log(`\nLeads without embeddings: ${rows.length}`);

  let success = 0;
  let failed = 0;

  for (const lead of rows) {
    const text = leadEmbeddingText(lead);
    if (!text) {
      console.log(`  skip ${lead.id} — no text`);
      continue;
    }
    try {
      const vec = await embedText(text);
      await client.query(
        `UPDATE crm.leads SET embedding = $2::vector WHERE id = $1`,
        [lead.id, JSON.stringify(vec)],
      );
      console.log(`  ✓ ${lead.id} (${lead.business_name ?? "unnamed"})`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${lead.id}:`, err instanceof Error ? err.message : String(err));
      failed++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const { rows: after } = await client.query(
    `SELECT COUNT(*) AS total, COUNT(embedding) AS with_embedding FROM crm.leads`,
  );
  await client.query("COMMIT");
  console.log(`\nDone: ${success} embedded, ${failed} failed`);
  console.log(`DB state: ${after[0].with_embedding}/${after[0].total} leads have embeddings`);
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}

await pool.end();
