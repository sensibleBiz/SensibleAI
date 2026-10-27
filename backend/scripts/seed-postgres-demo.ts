import { createHash } from "node:crypto";
import argon2 from "argon2";
import dotenv from "dotenv";
import pg, { type PoolClient } from "pg";
import { ARGON2_OPTIONS } from "../src/modules/auth/auth.service.js";

dotenv.config({ path: ".env.local-private" });
dotenv.config({ path: ".env" });

const connectionString = process.env.DATABASE_ADMIN_URL;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL is required");

const ADMIN_EMAIL = "demo.admin@crm.local";
const ADMIN_PASSWORD = "DemoCRM@2026!";
const EMPLOYEE_PASSWORD = "DemoUser@2026!";
const TENANT_SLUG = "postgres-crm-demo";
const OUTLET_CODE = "DEMO-PUNE";

const stableId = (key: string) => {
  const value = createHash("sha256").update(`sensible-postgres-demo:${key}`).digest("hex").slice(0, 32).split("");
  value[12] = "7";
  value[16] = "8";
  return `${value.slice(0, 8).join("")}-${value.slice(8, 12).join("")}-${value.slice(12, 16).join("")}-${value.slice(16, 20).join("")}-${value.slice(20).join("")}`;
};

const oneId = async (client: PoolClient, sql: string, values: unknown[]) => {
  const result = await client.query<{ id: string }>(sql, values);
  if (!result.rows[0]?.id) throw new Error("Seed query did not return an id");
  return result.rows[0].id;
};

const pad = (value: number) => String(value).padStart(2, "0");
const dayId = (date: Date) => `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
const monthId = (date: Date) => `${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
const isoMonth = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
const atUtc = (date: Date, hour: number, minute = 0) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute);
const today = new Date();
const nowMs = Date.now();
const payrollDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
const indiaDate = new Date(nowMs + 19_800_000).toISOString().slice(0, 10);
const atIndiaTime = (hour: number, minute: number) =>
  new Date(`${indiaDate}T${pad(hour)}:${pad(minute)}:00.000+05:30`);

const employees = [
  { key: "employee-1", name: "Aarav Sharma", email: "aarav.sharma@crm.local", phone: "919100001101", code: "DEMO-001", department: "SALES", zone: "West", salary: 42000 },
  { key: "employee-2", name: "Meera Patil", email: "meera.patil@crm.local", phone: "919100001102", code: "DEMO-002", department: "SALES", zone: "Central", salary: 36000 },
  { key: "employee-3", name: "Rohan Kulkarni", email: "rohan.kulkarni@crm.local", phone: "919100001103", code: "DEMO-003", department: "SUPPORT", zone: "West", salary: 32000 },
  { key: "employee-4", name: "Isha Deshmukh", email: "isha.deshmukh@crm.local", phone: "919100001104", code: "DEMO-004", department: "HR", zone: "Head Office", salary: 39000 },
  { key: "employee-5", name: "Kabir Joshi", email: "kabir.joshi@crm.local", phone: "919100001105", code: "DEMO-005", department: "HARDWARE", zone: "Warehouse", salary: 30000 },
] as const;

const leadNames = [
  "Ananya Retail", "BrightPath Academy", "Cedar Health Clinic", "Disha Electronics",
  "Evergreen Foods", "Fusion Fitness", "GreenLeaf Traders", "Harmony Interiors",
  "Indus Auto Care", "Jupiter Consultancy", "Kaveri Boutique", "Lotus Dental Care",
];
const stages = ["NEW", "ASSIGNED", "FOLLOWUP", "WON", "LOST", "DISQUALIFIED"] as const;
const sources = ["Website", "Facebook", "Referral", "Google Ads", "Walk-in", "WhatsApp"];

const pool = new pg.Pool({ connectionString, max: 1, application_name: "sensible-crm-postgres-demo-seed" });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  // Demo provisioning is an administrative operation. Create an ephemeral
  // BYPASSRLS role inside this transaction, use it for the seed writes, and
  // drop it before commit. A rollback also removes the role and every grant,
  // so persistent runtime roles and permissions are never weakened.
  await client.query(`
    CREATE ROLE sensible_demo_seed_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
    GRANT sensible_demo_seed_role TO CURRENT_USER;
    GRANT USAGE ON SCHEMA iam, tenancy, crm TO sensible_demo_seed_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam, tenancy, crm TO sensible_demo_seed_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA iam, tenancy, crm TO sensible_demo_seed_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA iam, tenancy, crm TO sensible_demo_seed_role;
    SET LOCAL ROLE sensible_demo_seed_role;
  `);
  await client.query("SELECT set_config('app.is_super_admin', 'true', true)");

  const tenantId = await oneId(client, `
    INSERT INTO tenancy.tenants (id, name, slug, active)
    VALUES ($1, 'Sensible CRM Demo Company', $2, true)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now()
    RETURNING id`, [stableId("tenant"), TENANT_SLUG]);
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
  const businessId = await oneId(client, `
    INSERT INTO tenancy.businesses (id, tenant_id, name, legal_name, active)
    VALUES ($1, $2, 'Sensible CRM Demo Business', 'Sensible CRM Demo Private Limited', true)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, legal_name = EXCLUDED.legal_name, active = true
    RETURNING id`, [stableId("business"), tenantId]);
  const outletId = await oneId(client, `
    INSERT INTO tenancy.outlets (id, tenant_id, business_id, outlet_code, name, active)
    VALUES ($1, $2, $3, $4, 'Pune Demo Outlet', true)
    ON CONFLICT (tenant_id, outlet_code) DO UPDATE SET business_id = EXCLUDED.business_id, name = EXCLUDED.name, active = true
    RETURNING id`, [stableId("outlet"), tenantId, businessId, OUTLET_CODE]);

  const passwordHash = await argon2.hash(ADMIN_PASSWORD, ARGON2_OPTIONS);
  const employeePasswordHash = await argon2.hash(EMPLOYEE_PASSWORD, ARGON2_OPTIONS);
  const adminId = await oneId(client, `
    INSERT INTO iam.users (id, email, phone, display_name, active)
    VALUES ($1, $2, '919100001100', 'Demo CRM Administrator', true)
    ON CONFLICT (email) WHERE email IS NOT NULL
    DO UPDATE SET display_name = EXCLUDED.display_name, phone = EXCLUDED.phone, active = true
    RETURNING id`, [stableId("admin"), ADMIN_EMAIL]);
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [adminId]);
  await client.query(`INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin, active)
    VALUES ($1, $2, true, true) ON CONFLICT (tenant_id, user_id)
    DO UPDATE SET active = true, is_tenant_admin = true`, [tenantId, adminId]);
  await client.query(`
    INSERT INTO iam.user_credentials (user_id, password_hash, state, password_changed_at, refresh_token_version)
    VALUES ($1, $2, 'argon2id', now(), 0)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, state = 'argon2id',
      password_changed_at = now(), refresh_token_version = 0, failed_attempts = 0, locked_until = NULL`, [adminId, passwordHash]);

  const roleId = await oneId(client, `
    INSERT INTO iam.roles (id, tenant_id, name, description, active)
    VALUES ($1, $2, 'demo-admin', 'Full-access administrator for the PostgreSQL demo outlet', true)
    ON CONFLICT (tenant_id, name) DO UPDATE SET description = EXCLUDED.description, active = true
    RETURNING id`, [stableId("admin-role"), tenantId]);
  await client.query(`INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id, active)
    VALUES ($1, $2, $3, $4, true) ON CONFLICT (outlet_id, user_id, role_id) DO UPDATE SET active = true`, [tenantId, outletId, adminId, roleId]);
  await client.query(`INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
    SELECT $1, $2, id FROM iam.permissions ON CONFLICT (role_id, permission_id) DO NOTHING`, [tenantId, roleId]);

  // The production schema forces RLS even for table owners. Establish the
  // administrative request context only for this seed transaction so all
  // subsequent demo writes are scoped to the demo tenant and administrator.
  await client.query(`
    SELECT
      set_config('app.current_tenant_id', $1, true),
      set_config('app.current_user_id', $2, true),
      set_config('app.is_super_admin', 'true', true)
  `, [tenantId, adminId]);
  const policyContext = await client.query<{
    tenant_matches: boolean;
    user_matches: boolean;
    is_super_admin: boolean;
    has_tenant_access: boolean;
  }>(`
    SELECT
      tenancy.current_tenant_id() = $1::uuid AS tenant_matches,
      iam.current_user_id() = $2::uuid AS user_matches,
      iam.is_super_admin() AS is_super_admin,
      tenancy.has_tenant_access($1::uuid) AS has_tenant_access
  `, [tenantId, adminId]);
  const context = policyContext.rows[0];
  if (!context?.tenant_matches || !context.user_matches || !context.is_super_admin || !context.has_tenant_access) {
    throw new Error(`Demo seed RLS context is invalid: ${JSON.stringify(context)}`);
  }

  const features = ["dashboard", "customers", "leads", "activities", "reports", "calls", "attendance", "leave", "payroll", "expense", "products", "warehouse", "events", "team", "permissions", "ai_scrap", "whatsapp"];
  for (const feature of features) {
    await client.query(`INSERT INTO tenancy.outlet_features (tenant_id, outlet_id, feature_key, enabled)
      VALUES ($1, $2, $3, true) ON CONFLICT (outlet_id, feature_key) DO UPDATE SET enabled = true`, [tenantId, outletId, feature]);
  }

  const adminProfileId = await oneId(client, `INSERT INTO crm.user_profiles
    (id, tenant_id, business_id, user_id, profile_role, active) VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', true)
    ON CONFLICT (id) DO UPDATE SET profile_role = 'SUPER_ADMIN', active = true RETURNING id`, [stableId("admin-profile"), tenantId, businessId, adminId]);

  const staff: Array<(typeof employees)[number] & { userId: string; profileId: string }> = [];
  for (const employee of employees) {
    const userId = await oneId(client, `INSERT INTO iam.users (id, email, phone, display_name, active)
      VALUES ($1, $2, $3, $4, true) ON CONFLICT (email) WHERE email IS NOT NULL
      DO UPDATE SET phone = EXCLUDED.phone, display_name = EXCLUDED.display_name, active = true RETURNING id`,
      [stableId(employee.key), employee.email, employee.phone, employee.name]);
    await client.query(`INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin, active)
      VALUES ($1, $2, false, true) ON CONFLICT (tenant_id, user_id) DO UPDATE SET active = true`, [tenantId, userId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await client.query(`INSERT INTO iam.user_credentials (user_id, password_hash, state, password_changed_at)
      VALUES ($1, $2, 'argon2id', now()) ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
      state = 'argon2id', failed_attempts = 0, locked_until = NULL`, [userId, employeePasswordHash]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [adminId]);
    await client.query(`INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id, active)
      VALUES ($1, $2, $3, $4, true) ON CONFLICT (outlet_id, user_id, role_id) DO UPDATE SET active = true`, [tenantId, outletId, userId, roleId]);
    const profileId = await oneId(client, `INSERT INTO crm.user_profiles
      (id, tenant_id, business_id, user_id, profile_role, active) VALUES ($1, $2, $3, $4, 'USER', true)
      ON CONFLICT (id) DO UPDATE SET active = true RETURNING id`, [stableId(`${employee.key}-profile`), tenantId, businessId, userId]);
    await client.query(`INSERT INTO crm.team_memberships
      (id, tenant_id, business_id, outlet_id, user_profile_id, user_id, department, zone, manager_profile_id, emp_code, is_on_payroll, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,true) ON CONFLICT (id) DO UPDATE SET department=EXCLUDED.department,
      zone=EXCLUDED.zone, manager_profile_id=EXCLUDED.manager_profile_id, emp_code=EXCLUDED.emp_code, is_on_payroll=true, active=true`,
      [stableId(`${employee.key}-team`), tenantId, businessId, outletId, profileId, userId, employee.department, employee.zone, adminProfileId, employee.code]);
    staff.push({ ...employee, userId, profileId });
  }

  const trackingRoutes = [
    [
      [18.5590, 73.7868, "Baner Road"],
      [18.5549, 73.7926, "Baner Gaon"],
      [18.5503, 73.7985, "Aundh-Baner Link Road"],
      [18.5452, 73.8074, "Aundh"],
      [18.5402, 73.8148, "University Road"],
      [18.5362, 73.8224, "Ganeshkhind"],
      [18.5308, 73.8315, "Senapati Bapat Road"],
      [18.5264, 73.8382, "Model Colony"],
      [18.5237, 73.8454, "Shivajinagar"],
      [18.5197, 73.8530, "JM Road"],
      [18.5162, 73.8568, "Deccan Gymkhana"],
      [18.5108, 73.8516, "Erandwane"],
    ],
    [
      [18.5590, 73.7868, "Baner Road"],
      [18.5643, 73.7769, "Balewadi High Street"],
      [18.5708, 73.7645, "Balewadi"],
      [18.5792, 73.7581, "Wakad Road"],
      [18.5867, 73.7632, "Wakad"],
      [18.5918, 73.7734, "Pimple Nilakh"],
      [18.5860, 73.7835, "Vishal Nagar"],
      [18.5797, 73.7924, "Pimple Saudagar Road"],
      [18.5719, 73.7998, "Jagtap Dairy"],
      [18.5650, 73.8017, "Aundh-Ravet Road"],
      [18.5615, 73.7950, "Baner-Aundh Link Road"],
      [18.5590, 73.7868, "Pune Demo Outlet"],
    ],
  ] as const;
  for (const [employeeIndex, employee] of staff.filter((item) => item.department === "SALES").entries()) {
    const route = trackingRoutes[employeeIndex % trackingRoutes.length]!;
    for (const [pointIndex, [latitude, longitude, address]] of route.entries()) {
      const timestamp = atIndiaTime(9 + Math.floor(pointIndex * 45 / 60), pointIndex * 45 % 60);
      const externalId = `DEMO-TRACK-${employee.code}-${indiaDate}-${pad(pointIndex + 1)}`;
      await client.query(`INSERT INTO crm.user_tracking_history
        (id,tenant_id,outlet_id,user_id,latitude,longitude,address,user_name,recorded_at,
         accuracy_meters,device_id,external_source,external_id,created_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'demo-seed',$12,$13)
        ON CONFLICT (id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
          address=EXCLUDED.address,user_name=EXCLUDED.user_name,recorded_at=EXCLUDED.recorded_at,
          accuracy_meters=EXCLUDED.accuracy_meters,device_id=EXCLUDED.device_id`,
        [stableId(`tracking-${employee.key}-${indiaDate}-${pointIndex + 1}`), tenantId, outletId,
         employee.userId, latitude, longitude, address, employee.name, timestamp,
         6 + pointIndex % 5, `DEMO-PHONE-${employeeIndex + 1}`, externalId, adminId]);
    }
  }

  const customerIds: string[] = [];
  const leadIds: string[] = [];
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [adminId]);
  for (let i = 0; i < leadNames.length; i += 1) {
    const name = leadNames[i]!;
    const mobile = `91920000${String(2100 + i)}`;
    const email = `contact${i + 1}@demo-customer.local`;
    const customerId = stableId(`customer-${i + 1}`);
    const leadId = stableId(`lead-${i + 1}`);
    const assigned = staff[i % 3]!.userId;
    const createdAt = new Date(Date.now() - i * 86_400_000);
    await client.query(`INSERT INTO crm.customers
      (id,tenant_id,business_id,customer_code,customer_name,normalized_customer_name,business_name,normalized_business_name,
       mobile,normalized_mobile,email,normalized_email,business_type,area,city,state,priority,source,status,lifecycle,
       total_enquiries,total_won,total_lost,created_by,updated_by,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$5,$6,$7,$7,$8,$8,'Retail','Pune Demo Area','Pune','Maharashtra',$9,$10,'ACTIVE',$11,2,$12,0,$13,$13,$14)
      ON CONFLICT (id) DO UPDATE SET customer_name=EXCLUDED.customer_name, priority=EXCLUDED.priority, source=EXCLUDED.source,
      lifecycle=EXCLUDED.lifecycle, total_won=EXCLUDED.total_won, updated_by=EXCLUDED.updated_by`,
      [customerId, tenantId, businessId, `DEMO-CUST-${pad(i + 1)}`, name, name.toLowerCase(), mobile, email,
       i % 3 === 0 ? "HIGH" : "MEDIUM", sources[i % sources.length], i % 4 === 0 ? "REPEAT_CUSTOMER" : "PROSPECT", stages[i % stages.length] === "WON" ? 1 : 0, adminId, createdAt]);
    await client.query(`INSERT INTO crm.customer_outlets (id,tenant_id,customer_id,outlet_id,is_primary)
      VALUES ($1,$2,$3,$4,true) ON CONFLICT (customer_id,outlet_id) DO UPDATE SET is_primary=true`, [stableId(`customer-outlet-${i + 1}`), tenantId, customerId, outletId]);
    await client.query(`INSERT INTO crm.customer_identities (id,tenant_id,customer_id,identity_type,normalized_value,verified_at)
      VALUES ($1,$2,$3,'MOBILE',$4,now()) ON CONFLICT (customer_id,identity_type,normalized_value) DO NOTHING`, [stableId(`customer-mobile-${i + 1}`), tenantId, customerId, mobile]);
    await client.query(`INSERT INTO crm.leads
      (id,tenant_id,business_id,outlet_id,customer_id,assigned_to_user_id,created_by_user_id,updated_by_user_id,
       customer_name,business_name,business_type,mobile,normalized_mobile,email,normalized_email,area,city,state,requirement,
       stage,source,priority,comments,tags,external_ref,campaign,ringing,whatsapp_share_count,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$8,'Retail',$9,$9,$10,$10,'Pune Demo Area','Pune','Maharashtra',$11,
       $12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (id) DO UPDATE SET assigned_to_user_id=EXCLUDED.assigned_to_user_id, stage=EXCLUDED.stage,
      priority=EXCLUDED.priority, comments=EXCLUDED.comments, updated_by_user_id=EXCLUDED.updated_by_user_id`,
      [leadId, tenantId, businessId, outletId, customerId, assigned, adminId, name, mobile, email,
       ["CRM annual subscription", "Attendance setup", "Lead automation", "Warehouse module"][i % 4], stages[i % stages.length],
       sources[i % sources.length], i % 3 === 0 ? "HIGH" : "MEDIUM", "Complete demo lead with follow-up history", ["demo", i % 2 ? "warm" : "priority"],
       `DEMO-LEAD-${i + 1}`, `September Demo Campaign ${i % 3 + 1}`, i % 5 === 0, i % 4, createdAt]);
    await client.query(`INSERT INTO crm.lead_assignment_history (id,tenant_id,lead_id,assigned_to_user_id,assigned_by_user_id,assigned_at)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [stableId(`lead-assignment-${i + 1}`), tenantId, leadId, assigned, adminId, createdAt]);
    await client.query(`INSERT INTO crm.lead_stage_history (id,tenant_id,lead_id,from_stage,to_stage,changed_by_user_id,changed_at)
      VALUES ($1,$2,$3,NULL,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [stableId(`lead-stage-${i + 1}`), tenantId, leadId, stages[i % stages.length], assigned, createdAt]);
    customerIds.push(customerId);
    leadIds.push(leadId);
  }

  for (let i = 0; i < leadIds.length; i += 1) {
    const employee = staff[i % 3]!;
    const done = i % 2 === 0;
    const scheduled = new Date(Date.now() + (i - 5) * 3_600_000);
    await client.query(`INSERT INTO crm.activities
      (id,tenant_id,business_id,outlet_id,lead_id,customer_id,assigned_to_user_id,created_by_user_id,updated_by_user_id,
       activity_type,status,mode,priority,description,scheduled_at,completed_at,lead_name_snapshot,lead_mobile_snapshot,lead_requirement_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, scheduled_at=EXCLUDED.scheduled_at, completed_at=EXCLUDED.completed_at`,
      [stableId(`activity-${i + 1}`), tenantId, businessId, outletId, leadIds[i], customerIds[i], employee.userId, adminId,
       ["Follow Up", "Demo", "Visit", "Installation"][i % 4], done ? "DONE" : "PENDING", i % 2 ? "Offline" : "Online",
       i % 3 === 0 ? "High" : "Medium", `Demo ${done ? "completed" : "scheduled"} activity for ${leadNames[i]}`,
       scheduled, done ? scheduled : null, leadNames[i], `91920000${String(2100 + i)}`, "CRM product demonstration"]);
    await client.query(`INSERT INTO crm.calls
      (id,tenant_id,business_id,outlet_id,lead_id,customer_id,logged_by_user_id,direction,duration_seconds,number,
       receiver_mobile_no,receiver_name,employee_label,department,logged_at,external_call_source,external_call_id,created_by_user_id,updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,'Sales',$13,'DEMO','DEMO-CALL-' || $14,$7,$7)
      ON CONFLICT (id) DO UPDATE SET direction=EXCLUDED.direction,duration_seconds=EXCLUDED.duration_seconds,logged_at=EXCLUDED.logged_at`,
      [stableId(`call-${i + 1}`), tenantId, businessId, outletId, leadIds[i], customerIds[i], employee.userId,
       ["outgoing", "incoming", "missed", "rejected"][i % 4], i % 4 < 2 ? 75 + i * 12 : 0, `91920000${String(2100 + i)}`,
       leadNames[i], employee.name, new Date(Date.now() - i * 7_200_000), String(i + 1)]);
  }

  const workDays: Date[] = [];
  for (let offset = 0; workDays.length < 15; offset += 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    if (date.getUTCDay() !== 0) workDays.push(date);
  }
  for (const [employeeIndex, employee] of staff.entries()) {
    for (const [dayIndex, date] of workDays.entries()) {
      if (employeeIndex === 1 && dayIndex === 2) continue;
      const checkIn = atUtc(date, 4, 0 + employeeIndex * 5);
      const checkOut = atUtc(date, 12, 30 + employeeIndex * 3);
      const key = `${employee.key}-${date.toISOString().slice(0, 10)}`;
      await client.query(`INSERT INTO crm.attendance_daily
        (id,tenant_id,business_id,outlet_id,user_id,day_id,month_id,year_id,check_in_time,check_out_time,is_present,emp_code,user_name,details)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13)
        ON CONFLICT (tenant_id,outlet_id,user_id,day_id) DO UPDATE SET check_in_time=EXCLUDED.check_in_time,
        check_out_time=EXCLUDED.check_out_time,is_present=true,details=EXCLUDED.details`,
        [stableId(`attendance-${key}`), tenantId, businessId, outletId, employee.userId, dayId(date), monthId(date), String(date.getUTCFullYear()),
         checkIn, checkOut, employee.code, employee.name, { source: employeeIndex < 3 ? "MOBILE" : "BIOMETRIC", status: "PRESENT", location: "Pune Demo Outlet" }]);
      for (const eventType of ["IN", "OUT"] as const) {
        await client.query(`INSERT INTO crm.attendance_events
          (id,tenant_id,business_id,outlet_id,user_id,device_id,device_user_id,event_type,event_at,source,external_event_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
          [stableId(`attendance-event-${key}-${eventType}`), tenantId, businessId, outletId, employee.userId,
           employeeIndex < 3 ? "DEMO-MOBILE" : "DEMO-BIOMETRIC", employee.code, eventType,
           new Date(eventType === "IN" ? checkIn : checkOut), employeeIndex < 3 ? "MOBILE" : "BIOMETRIC", `DEMO-${key}-${eventType}`]);
      }
    }
  }

  for (const [index, type] of ["Casual Leave", "Sick Leave", "Earned Leave"].entries()) {
    await client.query(`INSERT INTO crm.leave_types (id,tenant_id,business_id,outlet_id,name,short_code,active)
      VALUES ($1,$2,$3,$4,$5,$6,true) ON CONFLICT (tenant_id,outlet_id,name) DO UPDATE SET active=true`,
      [stableId(`leave-type-${index + 1}`), tenantId, businessId, outletId, type, ["CL", "SL", "EL"][index]]);
  }
  for (const employee of staff) {
    await client.query(`INSERT INTO crm.leave_balances
      (id,tenant_id,outlet_id,user_id,year,total_leaves,used_leaves,remaining_leaves,active,last_updated)
      VALUES ($1,$2,$3,$4,$5,18,2,16,true,$6) ON CONFLICT (tenant_id,outlet_id,user_id,year)
      DO UPDATE SET total_leaves=18,used_leaves=2,remaining_leaves=16,active=true,last_updated=EXCLUDED.last_updated`,
      [stableId(`leave-balance-${employee.key}-${today.getUTCFullYear()}`), tenantId, outletId, employee.userId, today.getUTCFullYear(), nowMs]);
  }
  const leaveDate = workDays[2]!;
  await client.query(`INSERT INTO crm.leave_requests
    (id,tenant_id,business_id,outlet_id,user_id,leave_type,from_date,to_date,duration,leave_note,no_days,status,
     manager_user_id,manager_name,action_taken_by,remark,day_id,month_id,created_date,updated_date)
    VALUES ($1,$2,$3,$4,$5,'Casual Leave',$6,$7,'Full Day','Personal work - demo approved leave',1,'APPROVED',
     $8,'Demo CRM Administrator',$8,'Approved demo request',$9,$10,$11,$11)
    ON CONFLICT (id) DO UPDATE SET status='APPROVED',action_taken_by=EXCLUDED.action_taken_by,updated_date=EXCLUDED.updated_date`,
    [stableId("leave-request-1"), tenantId, businessId, outletId, staff[1]!.userId, atUtc(leaveDate,0), atUtc(leaveDate,23,59), adminId,
     dayId(leaveDate), monthId(leaveDate), nowMs]);
  await client.query(`INSERT INTO crm.holidays
    (id,tenant_id,business_id,outlet_id,name,title,holiday_date,date_string,year,is_active,is_paid,holiday_type,description,applicable_states,applicable_outlets)
    VALUES ($1,$2,$3,$4,'Demo Foundation Day','Demo Foundation Day',$5,$6,$7,true,true,'COMPANY','Sample paid holiday',ARRAY['Maharashtra'],ARRAY[$4]::uuid[])
    ON CONFLICT (id) DO UPDATE SET holiday_date=EXCLUDED.holiday_date,is_active=true`,
    [stableId("holiday-1"), tenantId, businessId, outletId, new Date(Date.UTC(today.getUTCFullYear(),11,20)), `20-12-${today.getUTCFullYear()}`, String(today.getUTCFullYear())]);

  const categoryId = stableId("product-category");
  await client.query(`INSERT INTO crm.product_categories
    (id,tenant_id,business_id,name,description,created_by_user_id,updated_by_user_id)
    VALUES ($1,$2,$3,'CRM Solutions','Demo software and hardware products',$4,$4)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,updated_by_user_id=EXCLUDED.updated_by_user_id`, [categoryId, tenantId, businessId, adminId]);
  const products = [
    ["CRM Annual Plan", "CRM-ANNUAL", 18000, 15000, 8000],
    ["Field Tracking Add-on", "TRACK-ADDON", 6000, 4500, 2000],
    ["Biometric Device", "BIO-DEVICE", 12500, 10000, 7500],
    ["WhatsApp Automation", "WA-PACK", 9000, 7500, 3500],
  ] as const;
  const productIds: string[] = [];
  for (const [i, product] of products.entries()) {
    const productId = stableId(`product-${i + 1}`);
    await client.query(`INSERT INTO crm.products
      (id,tenant_id,business_id,name,sku,brand,category_id,description,mrp_price,price,purchase_price,tax_percent,is_add_on,
       min_unit,uid_map,custom_fields,created_by_user_id,updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,'Sensible CRM',$6,'Complete demo product',$7,$8,$9,18,$10,$11,$12,$13,$14,$14)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,price=EXCLUDED.price,mrp_price=EXCLUDED.mrp_price,updated_by_user_id=EXCLUDED.updated_by_user_id`,
      [productId, tenantId, businessId, product[0], product[1], categoryId, product[2], product[3], product[4], i === 1 || i === 3,
       { unit: "piece" }, { sku: product[1] }, { demo: true }, adminId]);
    await client.query(`INSERT INTO crm.product_outlets (id,tenant_id,product_id,outlet_id,active)
      VALUES ($1,$2,$3,$4,true) ON CONFLICT (product_id,outlet_id) DO UPDATE SET active=true`, [stableId(`product-outlet-${i + 1}`), tenantId, productId, outletId]);
    productIds.push(productId);
  }
  const warehouseIds = [stableId("warehouse-main"), stableId("warehouse-field")];
  for (const [i, warehouseId] of warehouseIds.entries()) {
    await client.query(`INSERT INTO crm.warehouses
      (id,tenant_id,business_id,outlet_id,name,code,address,created_by_user_id,updated_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,address=EXCLUDED.address,updated_by_user_id=EXCLUDED.updated_by_user_id`,
      [warehouseId, tenantId, businessId, outletId, i ? "Field Stock Point" : "Main Demo Warehouse", i ? "DEMO-FIELD" : "DEMO-MAIN",
       i ? "Hinjewadi, Pune" : "Baner, Pune", adminId]);
    for (const [j, productId] of productIds.entries()) {
      await client.query(`INSERT INTO crm.warehouse_stock (id,tenant_id,warehouse_id,product_id,quantity,reorder_level)
        VALUES ($1,$2,$3,$4,$5,5) ON CONFLICT (warehouse_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity,reorder_level=5`,
        [stableId(`stock-${i}-${j}`), tenantId, warehouseId, productId, 15 + i * 5 + j * 7]);
    }
  }
  await client.query(`INSERT INTO crm.warehouse_transfers
    (id,tenant_id,business_id,outlet_id,product_id,from_warehouse_id,to_warehouse_id,requested_quantity,accepted_quantity,rejected_quantity,
     status,requested_by_user_id,action_taken_by_user_id,request_date,action_date,remarks)
    VALUES ($1,$2,$3,$4,$5,$6,$7,5,5,0,'ACCEPTED',$8,$9,now()-interval '2 days',now()-interval '1 day','Completed demo stock transfer')
    ON CONFLICT (id) DO UPDATE SET status='ACCEPTED',accepted_quantity=5,action_taken_by_user_id=EXCLUDED.action_taken_by_user_id`,
    [stableId("warehouse-transfer"), tenantId, businessId, outletId, productIds[2], warehouseIds[0], warehouseIds[1], staff[4]!.userId, adminId]);

  for (const employee of staff) {
    const structureId = stableId(`salary-${employee.key}`);
    const salaryDocument = { employeeName: employee.name, empCode: employee.code, grossSalary: employee.salary, earnings: { basic: employee.salary * 0.5, hra: employee.salary * 0.2, allowances: employee.salary * 0.3 }, deductions: { professionalTax: 200 }, demo: true };
    await client.query(`INSERT INTO crm.employee_salary_structures
      (id,tenant_id,business_id,outlet_id,user_id,emp_code,gross_salary,monthly_salary,is_active,document)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7,true,$8) ON CONFLICT (tenant_id,outlet_id,user_id)
      DO UPDATE SET gross_salary=EXCLUDED.gross_salary,monthly_salary=EXCLUDED.monthly_salary,is_active=true,document=EXCLUDED.document`,
      [structureId, tenantId, businessId, outletId, employee.userId, employee.code, employee.salary, salaryDocument]);
    const netSalary = employee.salary - 200;
    const payrollKey = `${employee.userId}_${pad(payrollDate.getUTCMonth() + 1)}_${payrollDate.getUTCFullYear()}`;
    const payrollDocument = { employeeName: employee.name, empCode: employee.code, month: payrollDate.getUTCMonth() + 1, year: payrollDate.getUTCFullYear(), presentDays: 25, paidDays: 26, grossSalary: employee.salary, deductions: 200, netSalary, status: "GENERATED", demo: true };
    const payrollRunId = await oneId(client, `INSERT INTO crm.payroll_runs
      (id,tenant_id,business_id,outlet_id,user_id,payroll_key,month,year,status,calculation_hash,gross_salary,net_salary,document)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'GENERATED',$9,$10,$11,$12)
      ON CONFLICT (tenant_id,outlet_id,payroll_key) DO UPDATE SET gross_salary=EXCLUDED.gross_salary,net_salary=EXCLUDED.net_salary,document=EXCLUDED.document RETURNING id`,
      [stableId(`payroll-${employee.key}-${isoMonth(payrollDate)}`), tenantId, businessId, outletId, employee.userId, payrollKey,
       payrollDate.getUTCMonth() + 1, payrollDate.getUTCFullYear(), stableId(`payroll-hash-${employee.key}`), employee.salary, netSalary, payrollDocument]);
    await client.query(`INSERT INTO crm.payroll_run_summaries (tenant_id,outlet_id,user_id,payroll_run_id,document)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,outlet_id,user_id) DO UPDATE SET payroll_run_id=EXCLUDED.payroll_run_id,document=EXCLUDED.document,updated_at=now()`,
      [tenantId, outletId, employee.userId, payrollRunId, payrollDocument]);
  }

  const expenseCategories: string[] = [];
  for (const [i, category] of ["Travel", "Meals", "Office Supplies", "Marketing"].entries()) {
    const id = stableId(`expense-category-${i + 1}`);
    await client.query(`INSERT INTO crm.expense_categories (id,tenant_id,business_id,outlet_id,category)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,outlet_id,category) DO UPDATE SET category=EXCLUDED.category`, [id, tenantId, businessId, outletId, category]);
    expenseCategories.push(id);
  }
  const expenseStatuses = ["PENDING", "REVIEWED", "APPROVED", "REJECTED", "APPROVED", "PENDING"];
  for (let i = 0; i < expenseStatuses.length; i += 1) {
    const status = expenseStatuses[i]!;
    const employee = staff[i % staff.length]!;
    await client.query(`INSERT INTO crm.expenses
      (id,tenant_id,business_id,outlet_id,user_id,amount,month_id,status,category_id,purpose,created_date,details,
       reviewed_by,reviewed_at,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,status_changed_by,status_changed_at,status_version,update_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,1,$21)
      ON CONFLICT (id) DO UPDATE SET amount=EXCLUDED.amount,status=EXCLUDED.status,purpose=EXCLUDED.purpose,details=EXCLUDED.details,
      reviewed_by=EXCLUDED.reviewed_by,approved_by=EXCLUDED.approved_by,rejected_by=EXCLUDED.rejected_by,status_changed_at=EXCLUDED.status_changed_at`,
      [stableId(`expense-${i + 1}`), tenantId, businessId, outletId, employee.userId, [850,1250,2400,975,3200,640][i], isoMonth(today), status,
       expenseCategories[i % expenseCategories.length], ["Client visit", "Team lunch", "Printer supplies", "Demo campaign"][i % 4], nowMs - i * 86_400_000,
       { invoiceNo: `DEMO-INV-${1001 + i}`, paymentMode: i % 2 ? "UPI" : "CARD", demo: true }, status !== "PENDING" ? adminId : null,
       status !== "PENDING" ? nowMs : null, status === "APPROVED" ? adminId : null, status === "APPROVED" ? nowMs : null,
       status === "REJECTED" ? adminId : null, status === "REJECTED" ? nowMs : null, status === "REJECTED" ? "Receipt unclear (demo)" : null,
       status === "PENDING" ? employee.userId : adminId, nowMs]);
  }

  await client.query(`INSERT INTO crm.outlet_events
    (id,tenant_id,business_id,outlet_id,external_event_id,title,description,terms,event_at,expiry_at,address,location,post_link,fees,offer,is_active,image_url,image_list,members)
    VALUES ($1,$2,$3,$4,'DEMO-EVENT-001','CRM Demo Workshop','Hands-on CRM, attendance and reports demonstration','Free demo registration',
      now()+interval '14 days',now()+interval '13 days','Baner, Pune',$5,'',0,0,true,'{}','[]',$6)
    ON CONFLICT (tenant_id,outlet_id,external_event_id) DO UPDATE SET title=EXCLUDED.title,event_at=EXCLUDED.event_at,expiry_at=EXCLUDED.expiry_at,members=EXCLUDED.members`,
    [stableId("event-1"), tenantId, businessId, outletId, { city: "Pune", latitude: 18.559, longitude: 73.7868 },
     JSON.stringify([{ name: "Demo Participant", mobile: "919400005001", email: "participant@demo.local", status: "REGISTERED" }])]);

  await client.query(`
    RESET ROLE;
    DROP OWNED BY sensible_demo_seed_role;
    REVOKE sensible_demo_seed_role FROM CURRENT_USER;
    DROP ROLE sensible_demo_seed_role;
  `);
  await client.query("COMMIT");

  const counts = await client.query(`
    SELECT 'users' AS name, count(*)::int AS count FROM tenancy.tenant_memberships WHERE tenant_id=$1
    UNION ALL SELECT 'leads', count(*)::int FROM crm.leads WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'customers', count(*)::int FROM crm.customer_outlets WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'activities', count(*)::int FROM crm.activities WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'calls', count(*)::int FROM crm.calls WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'attendance', count(*)::int FROM crm.attendance_daily WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'leave_requests', count(*)::int FROM crm.leave_requests WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'products', count(*)::int FROM crm.product_outlets WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'warehouses', count(*)::int FROM crm.warehouses WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'payroll_runs', count(*)::int FROM crm.payroll_runs WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'expenses', count(*)::int FROM crm.expenses WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'tracking_points', count(*)::int FROM crm.user_tracking_history WHERE tenant_id=$1 AND outlet_id=$2
    UNION ALL SELECT 'events', count(*)::int FROM crm.outlet_events WHERE tenant_id=$1 AND outlet_id=$2`, [tenantId, outletId]);
  console.log(JSON.stringify({ success: true, database: "crmdb", tenantId, businessId, outletId, outletCode: OUTLET_CODE,
    outletName: "Pune Demo Outlet", adminEmail: ADMIN_EMAIL, employeeEmails: employees.map((item) => item.email),
    counts: Object.fromEntries(counts.rows.map((row) => [row.name, row.count])) }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
