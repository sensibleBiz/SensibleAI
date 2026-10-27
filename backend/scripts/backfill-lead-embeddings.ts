/**
 * One-time backfill: generate and store embeddings for all crm.leads rows
 * that currently have embedding IS NULL.
 *
 * Uses DATABASE_ADMIN_URL (bypasses RLS) to update all tenants in one pass.
 * Run once after migration 0036 is applied.
 *
 * Usage:
 *   cd backend
 *   npm run db:backfill-embeddings
 */

import { Pool } from "pg";
import { env } from "../src/config/env.js";
import { embedText, leadEmbeddingText } from "../src/modules/assistant/tools/embeddingService.js";

const BATCH_SIZE = 50;
const DELAY_MS = 200; // stay well under the Gemini embedding API quota

const connectionString = env.database.adminUrl ?? env.database.url;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

const pool = new Pool({ connectionString, max: 3, application_name: "sensible-crm-backfill-embeddings" });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface LeadRow {
  id: string;
  business_name: string | null;
  requirement: string | null;
  source: string | null;
  city: string | null;
  state: string | null;
}

async function run() {
  // Count total leads that need backfilling
  const countResult = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM crm.leads WHERE embedding IS NULL`,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  if (total === 0) {
    console.log("All leads already have embeddings. Nothing to do.");
    await pool.end();
    return;
  }

  console.log(`Backfilling embeddings for ${total} leads in batches of ${BATCH_SIZE}...`);

  let processed = 0;
  let failed = 0;
  let lastId = "00000000-0000-0000-0000-000000000000";

  while (true) {
    const batchResult = await pool.query<LeadRow>(
      `SELECT id, business_name, requirement, source, city, state
       FROM crm.leads
       WHERE embedding IS NULL AND id > $1
       ORDER BY id
       LIMIT $2`,
      [lastId, BATCH_SIZE],
    );

    if (batchResult.rows.length === 0) break;

    // Generate embeddings in parallel within the batch
    const updates = await Promise.allSettled(
      batchResult.rows.map(async (lead) => {
        const text = leadEmbeddingText(lead);
        if (!text) return null; // skip leads with no embeddable text
        const vec = await embedText(text);
        return { id: lead.id, vec };
      }),
    );

    // Write successful embeddings
    for (const result of updates) {
      if (result.status === "rejected") {
        console.error("  Embedding failed:", result.reason);
        failed++;
        continue;
      }
      if (!result.value) continue; // no text to embed

      const { id, vec } = result.value;
      await pool.query(
        `UPDATE crm.leads SET embedding = $2::vector WHERE id = $1`,
        [id, JSON.stringify(vec)],
      );
      processed++;
    }

    lastId = batchResult.rows.at(-1)!.id;
    console.log(`  ${processed} done, ${failed} failed (cursor: ${lastId.slice(0, 8)}…)`);

    await sleep(DELAY_MS);
  }

  console.log(`\nBackfill complete. ${processed} updated, ${failed} failed.`);
  await pool.end();
}

run().catch((error) => {
  console.error("Backfill script failed:", error);
  process.exit(1);
});
