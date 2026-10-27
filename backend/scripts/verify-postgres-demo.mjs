import argon2 from "argon2";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local-private" });
dotenv.config({ path: ".env" });

const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();
const identity = await client.query(
  `SELECT * FROM iam.lookup_login_identity($1)`,
  ["demo.admin@crm.local"],
);
const row = identity.rows[0];
if (!row || !(await argon2.verify(row.password_hash, "DemoCRM@2026!"))) {
  throw new Error("Demo administrator login verification failed");
}
const membership = row.memberships?.[0];
if (!membership?.tenantId || !row.user_id) {
  throw new Error("Demo administrator tenant membership is missing");
}
await client.query(`
  SELECT
    set_config('app.current_tenant_id', $1, false),
    set_config('app.current_user_id', $2, false),
    set_config('app.is_super_admin', $3, false)
`, [membership.tenantId, row.user_id, String(Boolean(membership.isTenantAdmin))]);
const reports = await client.query(`
  SELECT
    (SELECT count(*)::int FROM tenancy.tenant_memberships WHERE tenant_id = $1) AS users,
    (SELECT count(*)::int FROM crm.leads WHERE tenant_id = $1) AS leads,
    (SELECT count(*)::int FROM crm.customer_outlets WHERE tenant_id = $1) AS customers,
    (SELECT count(*)::int FROM crm.activities WHERE tenant_id = $1) AS activities,
    (SELECT count(*)::int FROM crm.calls WHERE tenant_id = $1) AS calls,
    (SELECT count(*)::int FROM crm.leave_requests WHERE tenant_id = $1) AS leave_requests,
    (SELECT count(*)::int FROM crm.products WHERE tenant_id = $1) AS products,
    (SELECT count(*)::int FROM crm.warehouses WHERE tenant_id = $1) AS warehouses,
    (SELECT count(*)::int FROM crm.payroll_runs WHERE tenant_id = $1) AS payroll_runs,
    (SELECT count(*)::int FROM crm.expenses WHERE tenant_id = $1) AS expenses,
    (SELECT count(*)::int FROM crm.user_tracking_history WHERE tenant_id = $1) AS tracking_points,
    (SELECT count(*)::int FROM crm.outlet_events WHERE tenant_id = $1) AS events,
    (SELECT jsonb_object_agg(stage, count) FROM (
      SELECT stage::text, count(*)::int AS count FROM crm.leads
      WHERE tenant_id = $1 GROUP BY stage
    ) s) AS lead_stages,
    (SELECT jsonb_object_agg(direction, count) FROM (
      SELECT direction::text, count(*)::int AS count FROM crm.calls
      WHERE tenant_id = $1 GROUP BY direction
    ) c) AS call_directions,
    (SELECT count(*)::int FROM crm.attendance_daily WHERE tenant_id = $1) AS attendance_rows,
    (SELECT jsonb_object_agg(status, count) FROM (
      SELECT status::text, count(*)::int AS count FROM crm.expenses
      WHERE tenant_id = $1 GROUP BY status
    ) e) AS expense_statuses,
    (SELECT count(*)::int FROM crm.user_tracking_history
      WHERE tenant_id = $1 AND recorded_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
        AND recorded_at < (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 day') AT TIME ZONE 'Asia/Kolkata'
    ) AS tracking_points_today`,
  [membership.tenantId],
);
console.log(JSON.stringify({
  loginVerified: true,
  database: (await client.query("SELECT current_database() AS name")).rows[0].name,
  membershipCount: row.memberships.length,
  reports: reports.rows[0],
}, null, 2));
await client.end();
