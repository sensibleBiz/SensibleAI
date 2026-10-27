import "../src/config/env.js";
import { getApplicationPool } from "../src/db/client.js";

const pool = getApplicationPool();
const { rows } = await pool.query(`
  SELECT id, business_name, outlet_id, tenant_id,
         CASE WHEN embedding IS NULL THEN 'NULL' ELSE vector_dims(embedding)::text END AS dims
  FROM crm.leads LIMIT 10
`);
console.log("Leads in DB:");
console.log(JSON.stringify(rows, null, 2));

const { rows: counts } = await pool.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(embedding) AS with_embedding,
    COUNT(*) - COUNT(embedding) AS without_embedding
  FROM crm.leads
`);
console.log("\nCounts:", counts[0]);
await pool.end();
