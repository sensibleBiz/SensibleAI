import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://sensible_crm_app:Sensible%402016@34.47.221.74:5432/sensible-database',
  ssl: { rejectUnauthorized: false }
});

try {
  const r = await pool.query("SELECT policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'users'");
  console.log('POLICIES:', JSON.stringify(r.rows, null, 2));
} catch (e) {
  console.error(e);
} finally {
  await pool.end();
}

