import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(backendDirectory, ".env.local-private") });
dotenv.config({ path: path.join(backendDirectory, ".env") });

const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_ADMIN_URL or DATABASE_URL is required to run seed-business-configurations");
  process.exit(1);
}

const DEFAULT_STAGES = [
  { stageKey: "NEW", displayName: "New Lead", stageOrder: 0, stageCategory: "OPEN", tabColor: "#2563eb", isDefault: true },
  { stageKey: "ASSIGNED", displayName: "Assigned", stageOrder: 1, stageCategory: "OPEN", tabColor: "#3b82f6", isDefault: false },
  { stageKey: "FOLLOWUP", displayName: "Follow Up", stageOrder: 2, stageCategory: "OPEN", tabColor: "#f59e0b", isDefault: false },
  { stageKey: "WON", displayName: "Won", stageOrder: 3, stageCategory: "WON", tabColor: "#10b981", isDefault: false },
  { stageKey: "LOST", displayName: "Lost", stageOrder: 4, stageCategory: "LOST", tabColor: "#ef4444", isDefault: false },
  { stageKey: "DISQUALIFIED", displayName: "Disqualified", stageOrder: 5, stageCategory: "DISQUALIFIED", tabColor: "#6b7280", isDefault: false },
] as const;

interface BusinessRow {
  id: string;
  tenant_id: string;
  name: string;
}

interface StageRow {
  id: string;
  stage_key: string;
}

const pool = new pg.Pool({
  connectionString,
  max: 1,
  application_name: "seed-business-configurations",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.is_super_admin', 'true', false)");

    const businessesRes = await client.query<BusinessRow>(
      "SELECT id, tenant_id, name FROM tenancy.businesses ORDER BY created_at ASC",
    );
    const businesses = businessesRes.rows;

    console.log(`Found ${businesses.length} business(es) to configure and seed stages for.`);

    let configsCreated = 0;
    let stagesCreated = 0;
    let leadsBackfilled = 0;

    for (const business of businesses) {
      // 1. Ensure default business configuration exists
      const configRes = await client.query(
        `INSERT INTO tenancy.business_configurations (
           tenant_id, business_id, vertical, business_model, template_version, currency, terminology_overrides, is_configured, settings
         )
         VALUES ($1, $2, 'default', 'b2b', '1.0.0', 'INR', '{}'::jsonb, false, '{}'::jsonb)
         ON CONFLICT (tenant_id, business_id) DO NOTHING
         RETURNING id`,
        [business.tenant_id, business.id],
      );
      if (configRes.rowCount && configRes.rowCount > 0) {
        configsCreated++;
      }

      // 2. Ensure default pipeline stages exist
      for (const stage of DEFAULT_STAGES) {
        const stageRes = await client.query(
          `INSERT INTO crm.business_pipeline_stages (
             tenant_id, business_id, pipeline_type, stage_key, display_name, stage_order, stage_category, tab_color, is_active, is_default
           )
           VALUES ($1, $2, 'lead', $3, $4, $5, $6, $7, true, $8)
           ON CONFLICT (business_id, pipeline_type, stage_key) DO NOTHING
           RETURNING id`,
          [
            business.tenant_id,
            business.id,
            stage.stageKey,
            stage.displayName,
            stage.stageOrder,
            stage.stageCategory,
            stage.tabColor,
            stage.isDefault,
          ],
        );
        if (stageRes.rowCount && stageRes.rowCount > 0) {
          stagesCreated++;
        }
      }

      // 3. Map existing crm.leads without stage_id to matching business_pipeline_stages.id
      const stagesRes = await client.query<StageRow>(
        `SELECT id, stage_key FROM crm.business_pipeline_stages
         WHERE business_id = $1 AND pipeline_type = 'lead'`,
        [business.id],
      );

      for (const stageRow of stagesRes.rows) {
        const updateLeadsRes = await client.query(
          `UPDATE crm.leads
           SET stage_id = $1
           WHERE business_id = $2
             AND stage::text = $3
             AND stage_id IS NULL`,
          [stageRow.id, business.id, stageRow.stage_key],
        );
        leadsBackfilled += updateLeadsRes.rowCount ?? 0;
      }
    }

    await client.query("COMMIT");

    console.log("Seeding and migration summary:");
    console.log(`- Businesses processed: ${businesses.length}`);
    console.log(`- New business configurations created: ${configsCreated}`);
    console.log(`- New pipeline stages created: ${stagesCreated}`);
    console.log(`- Leads updated with stage_id: ${leadsBackfilled}`);
    console.log("Business configurations and pipeline stages successfully seeded!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error seeding business configurations:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Fatal error running seeder:", err);
  process.exit(1);
});
