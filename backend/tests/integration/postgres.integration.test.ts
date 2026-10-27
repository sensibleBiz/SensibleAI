import assert from "node:assert/strict";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import argon2 from "argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";
import { seedFoundation } from "../../src/db/seeds/foundation.js";
import { env } from "../../src/config/env.js";
import type { TransactionDatabase } from "../../src/db/context.js";
import { PostgresAuthRepository } from "../../src/modules/auth/auth.repository.js";
import { ARGON2_OPTIONS, AuthService } from "../../src/modules/auth/auth.service.js";
import { TokenService } from "../../src/modules/auth/token.service.js";
import { PostgresAuthorizationRepository } from "../../src/modules/authorization/postgresAuthorization.repository.js";
import * as databaseSchema from "../../src/db/schema/index.js";
import { PostgresCustomerRepository } from "../../src/modules/customers/postgresCustomer.repository.js";
import { PostgresCustomerService } from "../../src/modules/customers/postgresCustomer.service.js";
import { PostgresLeadRepository } from "../../src/modules/leads/postgresLead.repository.js";
import { PostgresLeadService } from "../../src/modules/leads/postgresLead.service.js";
import { PostgresActivityRepository } from "../../src/modules/activities/postgresActivity.repository.js";
import { PostgresActivityService } from "../../src/modules/activities/postgresActivity.service.js";
import { PostgresTeamRepository } from "../../src/modules/team/postgresTeam.repository.js";
import { PostgresTeamService } from "../../src/modules/team/postgresTeam.service.js";
import { PostgresLeaveRepository } from "../../src/modules/leave/postgresLeave.repository.js";
import { PostgresLeaveService } from "../../src/modules/leave/postgresLeave.service.js";
import { postgresExpenseService } from "../../src/modules/expense/postgresExpense.service.js";
import { postgresAccessControlService } from "../../src/modules/authorization/postgresAccessControl.service.js";
import { PostgresProductRepository } from "../../src/modules/products/postgresProduct.repository.js";
import { PostgresProductService } from "../../src/modules/products/postgresProduct.service.js";
import { PostgresWarehouseRepository } from "../../src/modules/warehouses/postgresWarehouse.repository.js";
import { PostgresWarehouseService } from "../../src/modules/warehouses/postgresWarehouse.service.js";
import { postgresUserTrackingService } from "../../src/modules/userTracking/postgresUserTracking.service.js";
import { postgresQuotationService } from "../../src/modules/quotations/postgresQuotation.service.js";
import { businessConfigurationService } from "../../src/modules/businessConfiguration/businessConfiguration.service.js";
import { saveBusinessConfigurationSchema } from "../../src/modules/businessConfiguration/businessConfiguration.validator.js";
import { PostgresAiRetrievalRepository } from "../../src/modules/aiRetrieval/postgresAiRetrieval.repository.js";
import { aiAgentActionsService } from "../../src/modules/aiAgentActions/aiAgentActions.service.js";
import { aiAgentActionProposalSchema } from "../../src/modules/aiAgentActions/aiAgentActions.validator.js";

const adminConnectionString = process.env.DATABASE_ADMIN_URL;
const migrationsFolder = path.resolve(process.cwd(), "migrations");

const databaseUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

const withAppContext = async <T>(
  client: PoolClient,
  tenantId: string,
  userId: string,
  operation: () => Promise<T>,
) => {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE sensible_app_role");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.is_super_admin', 'false', true)");
    const value = await operation();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const ids = {
  tenantA: "01994abc-0000-7000-8000-000000000001",
  tenantB: "01994abc-0000-7000-8000-000000000002",
  businessA: "01994abc-0000-7000-8000-000000000011",
  businessB: "01994abc-0000-7000-8000-000000000012",
  outletA1: "01994abc-0000-7000-8000-000000000021",
  outletA2: "01994abc-0000-7000-8000-000000000022",
  outletB: "01994abc-0000-7000-8000-000000000023",
  roleA: "01994abc-0000-7000-8000-000000000031",
  roleB: "01994abc-0000-7000-8000-000000000032",
  permission: "01994abc-0000-7000-8000-000000000041",
  userA: "01994abc-0000-7000-8000-000000000051",
  adminA: "01994abc-0000-7000-8000-000000000052",
  userB: "01994abc-0000-7000-8000-000000000053",
};

const verifyFreshDatabase = async (connectionString: string) => {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await pool.query("SELECT set_config('app.is_super_admin', 'true', false)");
    await migrate(drizzle(pool), { migrationsFolder });
    await migrate(drizzle(pool), { migrationsFolder });
    await seedFoundation(pool);
    await seedFoundation(pool);
    assert.equal(Number((await pool.query("SELECT count(*) FROM iam.permissions")).rows[0]?.count), 94);
    assert.equal(Number((await pool.query("SELECT count(*) FROM drizzle.__drizzle_migrations")).rows[0]?.count), 48);
    const extensions = await pool.query<{ extname: string }>("SELECT extname FROM pg_extension");
    assert.deepEqual(
      ["uuid-ossp", "pgcrypto", "ltree"].filter((name) => !extensions.rows.some((row) => row.extname === name)),
      [],
    );
    const tables = await pool.query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_schema IN ('iam', 'tenancy', 'crm', 'reference_data', 'billing') AND table_type = 'BASE TABLE'
    `);
    const actualTables = new Set(tables.rows.map((row) => `${row.table_schema}.${row.table_name}`));
    for (const table of [
      "tenancy.tenants", "tenancy.businesses", "tenancy.outlets", "iam.permissions", "iam.roles",
      "iam.role_permissions", "iam.users", "iam.user_credentials", "tenancy.tenant_memberships",
      "tenancy.outlet_assignments", "tenancy.outlet_features",
      "tenancy.plan_catalogs", "tenancy.outlet_subscriptions", "iam.qr_sessions",
      "crm.customers", "crm.customer_outlets", "crm.customer_identities",
      "crm.leads", "crm.lead_assignment_history", "crm.lead_stage_history", "crm.lead_share_tokens",
      "crm.activities",
      "crm.product_categories", "crm.products", "crm.product_outlets",
      "crm.warehouses", "crm.warehouse_stock", "crm.stock_ledger",
      "crm.stock_adjustments", "crm.stock_adjustment_items", "crm.warehouse_transfers",
      "crm.user_profiles", "crm.team_memberships",
      "crm.attendance_events", "crm.attendance_daily", "crm.leave_types",
      "crm.leave_requests", "crm.leave_balances", "crm.leave_balance_entries", "crm.holidays",
      "crm.employee_salary_structures", "crm.salary_structure_revisions",
      "crm.payroll_runs", "crm.payroll_run_summaries",
      "crm.expense_categories", "crm.expense_budget_allocations",
      "crm.expense_budget_transactions", "crm.expenses", "crm.expense_status_history",
      "iam.user_outlet_permissions", "iam.user_outlet_department_access",
      "tenancy.outlet_feature_configs", "iam.access_control_audit",
      "crm.employee_sales_targets",
      "crm.user_tracking_history",
      "crm.ai_contact_jobs",
      "crm.generated_contact_imports", "crm.generated_contacts",
      "crm.generated_contact_assignment_history",
      "reference_data.countries", "reference_data.states",
      "reference_data.cities", "reference_data.zones",
      "crm.tasks", "crm.task_status_history",
      "crm.quotations", "crm.quotation_items",
      "crm.timeline_events", "crm.ai_retrieval_jobs", "crm.ai_retrieval_chunks",
      "crm.ai_customer_dossiers", "crm.ai_dossier_usage_daily", "crm.ai_dossier_feedback",
      "crm.ai_agent_actions", "crm.ai_agent_action_history",
      "billing.wallets", "billing.wallet_transactions", "billing.rate_cards",
      "billing.usage_events", "billing.top_up_orders",
    ]) assert.ok(actualTables.has(table), `missing ${table}`);

    const constraints = await pool.query<{ conname: string }>(`
      SELECT conname FROM pg_constraint
      WHERE connamespace IN (
        'iam'::regnamespace, 'tenancy'::regnamespace,
        'crm'::regnamespace, 'billing'::regnamespace
      )
    `);
    const constraintNames = new Set(constraints.rows.map((row) => row.conname));
    for (const constraint of [
      "outlets_tenant_code_uq", "role_permissions_role_permission_uq",
      "tenant_memberships_tenant_user_uq", "outlet_features_outlet_key_uq",
      "outlets_business_tenant_fk", "role_permissions_role_tenant_fk",
      "outlet_assignments_outlet_tenant_fk", "outlet_assignments_membership_fk",
      "outlet_assignments_role_tenant_fk", "outlet_features_outlet_tenant_fk",
      "customers_business_tenant_fk", "customer_outlets_customer_tenant_fk",
      "customer_outlets_outlet_tenant_fk", "customer_identities_customer_tenant_fk",
      "leads_business_tenant_fk", "leads_outlet_tenant_fk",
      "lead_assignment_history_lead_tenant_fk", "lead_stage_history_lead_tenant_fk",
      "lead_share_tokens_lead_tenant_fk",
      "activities_business_tenant_fk", "activities_outlet_tenant_fk",
      "activities_lead_tenant_fk", "activities_customer_tenant_fk",
      "user_profiles_business_tenant_fk", "user_profiles_membership_fk",
      "team_memberships_outlet_tenant_fk", "team_memberships_profile_tenant_fk",
      "team_memberships_manager_tenant_fk", "team_memberships_not_self_managed_ck",
      "leave_balance_entries_outlet_tenant_fk", "leave_balance_entries_type_ck",
      "quotations_currency_ck", "quotations_incoterm_ck", "quotation_items_values_ck",
      "ai_retrieval_jobs_source_uq", "ai_retrieval_chunks_source_uq",
      "ai_customer_dossiers_subject_uq", "ai_dossier_usage_daily_scope_uq",
      "ai_dossier_feedback_user_uq",
      "ai_agent_actions_idempotency_uq", "ai_agent_actions_tenant_id_uq",
      "ai_agent_action_history_action_fk",
      "wallets_tenant_outlet_uq", "wallets_tenant_id_uq", "wallets_outlet_fk",
      "wallets_balance_nonneg_ck", "wallets_currency_ck",
      "wallet_txns_idempotency_uq", "wallet_txns_type_ck", "wallet_txns_credits_positive_ck",
      "usage_events_idempotency_uq", "usage_events_billing_coherence_ck",
      "top_up_orders_order_ref_uq", "top_up_success_coherence_ck",
    ]) assert.ok(constraintNames.has(constraint), `missing constraint ${constraint}`);

    const indexes = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes WHERE schemaname IN ('iam', 'tenancy', 'crm')
    `);
    const indexNames = new Set(indexes.rows.map((row) => row.indexname));
    for (const index of [
      "users_email_uq", "users_phone_uq", "users_legacy_id_uq",
      "businesses_tenant_legacy_id_uq", "outlets_tenant_legacy_id_uq",
      "roles_tenant_active_idx", "tenant_memberships_user_active_idx",
      "outlet_assignments_tenant_outlet_active_idx", "outlet_features_tenant_enabled_idx",
      "customers_tenant_mobile_idx", "customers_tenant_email_idx",
      "customer_outlets_tenant_outlet_idx", "customer_identities_lookup_idx",
      "leads_tenant_outlet_stage_idx", "leads_tenant_customer_idx",
      "leads_tenant_assigned_idx", "leads_tenant_mobile_idx", "leads_tenant_email_idx",
      "activities_tenant_outlet_scheduled_idx", "activities_tenant_lead_created_idx",
      "activities_tenant_customer_created_idx", "activities_tenant_assigned_scheduled_idx",
      "activities_tenant_status_scheduled_idx", "activities_tenant_type_created_idx",
      "activities_pending_scheduled_idx",
      "user_profiles_tenant_user_active_idx", "team_memberships_scope_uq",
      "team_memberships_outlet_department_active_idx", "team_memberships_manager_active_idx",
      "leave_balance_entries_user_year_idx", "leave_balance_entries_request_type_uq",
      "holidays_active_outlet_date_uq",
      "user_tracking_history_scope_recorded_idx", "user_tracking_history_external_uq",
      "tasks_outlet_updated_idx", "tasks_assignee_due_idx", "tasks_status_due_idx",
      "task_status_history_task_changed_idx",
      "quotations_outlet_created_idx", "quotations_lead_created_idx", "quotation_items_quotation_idx",
      "ai_retrieval_jobs_pending_idx", "ai_retrieval_chunks_search_gin_idx",
      "ai_retrieval_chunks_vector_idx",
      "ai_customer_dossiers_pending_idx", "ai_customer_dossiers_retention_idx",
      "ai_dossier_feedback_rollout_idx",
      "ai_agent_actions_scope_created_idx", "ai_agent_actions_scope_status_idx",
      "ai_agent_actions_target_idx", "ai_agent_action_history_action_idx",
    ]) assert.ok(indexNames.has(index), `missing index ${index}`);

    const role = await pool.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'sensible_app_role'",
    );
    assert.deepEqual(role.rows[0], { rolbypassrls: false, rolsuper: false });

    const forcedRls = await pool.query<{ count: string }>(`
      SELECT count(*) FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname IN ('iam', 'tenancy', 'crm') AND relation.relrowsecurity AND relation.relforcerowsecurity
    `);
    assert.equal(Number(forcedRls.rows[0]?.count), 93);

    await pool.query(`
      INSERT INTO tenancy.tenants (id, legacy_id, name, slug) VALUES
        ('${ids.tenantA}', 'legacy-tenant-a', 'Tenant A', 'tenant-a'),
        ('${ids.tenantB}', 'legacy-tenant-b', 'Tenant B', 'tenant-b');
      INSERT INTO tenancy.businesses (id, tenant_id, legacy_id, name) VALUES
        ('${ids.businessA}', '${ids.tenantA}', 'legacy-business-a', 'Business A'),
        ('${ids.businessB}', '${ids.tenantB}', 'legacy-business-b', 'Business B');
      INSERT INTO tenancy.outlets (id, tenant_id, business_id, legacy_id, outlet_code, name) VALUES
        ('${ids.outletA1}', '${ids.tenantA}', '${ids.businessA}', 'legacy-outlet-a1', 'A1', 'Outlet A1'),
        ('${ids.outletA2}', '${ids.tenantA}', '${ids.businessA}', 'legacy-outlet-a2', 'A2', 'Outlet A2'),
        ('${ids.outletB}', '${ids.tenantB}', '${ids.businessB}', 'legacy-outlet-b', 'B1', 'Outlet B');
      UPDATE iam.permissions SET id = '${ids.permission}' WHERE permission_key = 'outlets.read';
      INSERT INTO iam.roles (id, tenant_id, name) VALUES
        ('${ids.roleA}', '${ids.tenantA}', 'member'), ('${ids.roleB}', '${ids.tenantB}', 'member');
      INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
        VALUES ('${ids.tenantA}', '${ids.roleA}', '${ids.permission}');
      INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
        SELECT '${ids.tenantA}', '${ids.roleA}', id FROM iam.permissions
        WHERE permission_key IN (
          'customers.read', 'customers.create', 'customers.update', 'customers.archive',
          'products.read', 'products.create', 'products.update', 'products.archive',
          'categories.read', 'categories.create', 'categories.update', 'categories.archive',
          'warehouses.read', 'warehouses.create', 'warehouses.update', 'warehouses.archive',
          'inventory.read', 'inventory.adjust', 'inventory.transfer',
          'leads.read', 'leads.create', 'leads.import', 'leads.update', 'leads.assign', 'leads.share',
          'lead_reports.read', 'lead_reports.employee.read',
          'activities.read', 'activities.create', 'activities.update', 'activities.delete',
          'calls.read', 'calls.create', 'calls.reports.read',
          'attendance.read', 'attendance.delete', 'attendance.events.ingest',
          'leave.read', 'leave.create', 'leave.manage',
          'tracking.read', 'tracking.write',
          'payroll.read', 'payroll.manage',
          'expense.read', 'expense.review', 'expense.approve', 'expense.delete',
          'expense.budget.allocate', 'expense.budget.overspend',
          'ai_actions.read', 'ai_actions.propose', 'ai_actions.review',
          'whatsapp.messages.send'
        );
      INSERT INTO iam.users (id, legacy_id, email, display_name) VALUES
        ('${ids.userA}', 'legacy-user-a', 'a@example.com', 'User A'),
        ('${ids.adminA}', 'legacy-admin-a', 'admin-a@example.com', 'Admin A'),
        ('${ids.userB}', 'legacy-user-b', 'b@example.com', 'User B');
      INSERT INTO iam.user_credentials (user_id) VALUES ('${ids.userA}'), ('${ids.adminA}'), ('${ids.userB}');
      INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin) VALUES
        ('${ids.tenantA}', '${ids.userA}', false), ('${ids.tenantA}', '${ids.adminA}', true),
        ('${ids.tenantB}', '${ids.userB}', false);
      INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id) VALUES
        ('${ids.tenantA}', '${ids.outletA1}', '${ids.userA}', '${ids.roleA}'),
        ('${ids.tenantB}', '${ids.outletB}', '${ids.userB}', '${ids.roleB}');
      INSERT INTO tenancy.outlet_features (tenant_id, outlet_id, feature_key) VALUES
        ('${ids.tenantA}', '${ids.outletA1}', 'feature.a1'),
        ('${ids.tenantA}', '${ids.outletA2}', 'feature.a2'),
        ('${ids.tenantB}', '${ids.outletB}', 'feature.b');
    `);

    env.jwt.accessSecret = "integration-access-secret-that-is-at-least-32-characters";
    env.jwt.refreshSecret = "integration-refresh-secret-that-is-at-least-32-characters";
    const integrationPassword = randomBytes(24).toString("base64url");
    const passwordHash = await argon2.hash(integrationPassword, ARGON2_OPTIONS);
    await pool.query(`
      UPDATE iam.user_credentials
      SET password_hash = $1, state = 'argon2id', password_changed_at = now()
      WHERE user_id = $2
    `, [passwordHash, ids.userA]);
    const authService = new AuthService(
      new PostgresAuthRepository(pool),
      new TokenService(),
    );
    const login = await authService.login("a@example.com", integrationPassword);
    assert.equal(login.user.id, ids.userA);
    assert.equal(login.context.tenantId, ids.tenantA);

    const client = await pool.connect();
    try {
      const customerService = new PostgresCustomerService(new PostgresCustomerRepository());
      const leadService = new PostgresLeadService(new PostgresLeadRepository());
      const activityService = new PostgresActivityService(new PostgresActivityRepository());
      const teamService = new PostgresTeamService(new PostgresTeamRepository());
      const leaveService = new PostgresLeaveService(new PostgresLeaveRepository());
      const productService = new PostgresProductService(new PostgresProductRepository());
      const warehouseService = new PostgresWarehouseService(
        new PostgresWarehouseRepository(),
        new PostgresProductRepository(),
      );
      let catalogProductId = "";
      let sourceWarehouseId = "";
      let destinationWarehouseId = "";
      let directCustomerId = "";

      await withAppContext(client, ids.tenantA, ids.userA, async () => {
        const database = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
        const customer = await customerService.create(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          customerName: "Catalog Customer",
          businessName: "Catalog Stores",
          mobile: "9000000001",
          email: "catalog@example.com",
          businessType: "Retail",
          area: "Central",
          city: "Mumbai",
          state: "Maharashtra",
          priority: "High",
          source: "Integration",
        });
        directCustomerId = customer.customer.id;
        assert.equal(customer.created, true);
        assert.equal((await customerService.search(database, ids.tenantA, {
          outletId: ids.outletA1, query: "Catalog", limit: 10,
        })).items[0]?.id, directCustomerId);
        assert.equal((await customerService.match(database, ids.tenantA, {
          outletId: ids.outletA1, mobile: "9000000001", limit: 10,
        })).items[0]?.id, directCustomerId);
        assert.equal((await customerService.update(database, ids.tenantA, ids.userA, directCustomerId, {
          outletId: ids.outletA1, city: "Pune",
        })).city, "Pune");
        assert.deepEqual((await customerService.getEnquiries(
          database, ids.tenantA, ids.outletA1, directCustomerId,
        )).items, []);

        const category = await productService.createCategory(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1, name: "Integration Category", description: "PG-only category",
        });
        const product = await productService.create(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          name: "Integration Product",
          sku: "PG-PRODUCT-1",
          categoryId: category.id,
          mrpPrice: 125,
          price: 100,
          minUnit: { length: "10 cm" },
        });
        catalogProductId = product.id;
        assert.equal(product.price, 100);
        assert.equal((await productService.get(
          database, ids.tenantA, ids.userA, product.id, ids.outletA1,
        )).id, product.id);
        assert.equal((await productService.list(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1, search: "Integration Product", limit: 20,
        })).items[0]?.id, product.id);
        assert.equal((await productService.search(
          database, ids.tenantA, ids.userA, "PG-PRODUCT", ids.outletA1, 20,
        ))[0]?.id, product.id);
        assert.equal((await productService.update(database, ids.tenantA, ids.userA, product.id, {
          outletId: ids.outletA1, price: 95,
        })).price, 95);

        const sourceWarehouse = await warehouseService.createWarehouse(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1, name: "Source Warehouse", code: "SRC",
        });
        const destinationWarehouse = await warehouseService.createWarehouse(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1, name: "Destination Warehouse", code: "DST",
        });
        sourceWarehouseId = sourceWarehouse.id;
        destinationWarehouseId = destinationWarehouse.id;
        await warehouseService.adjustStock(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          warehouseId: sourceWarehouse.id,
          adjustmentType: "COUNT",
          reason: "Integration opening stock",
          items: [{ productId: product.id, newQuantity: 20 }],
        });
        const transfer = await warehouseService.createTransferRequest(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          productId: product.id,
          fromWarehouseId: sourceWarehouse.id,
          toWarehouseId: destinationWarehouse.id,
          requestedQuantity: 7,
        });
        assert.equal(transfer.status, "PENDING");
        const accepted = await warehouseService.actionTransferRequest(
          database, ids.tenantA, ids.userA, transfer.id,
          { outletId: ids.outletA1, action: "ACCEPT" },
        );
        assert.equal(accepted.status, "ACCEPTED");
        const stock = await warehouseService.listStock(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1, productId: product.id,
        });
        assert.equal(stock.find((item) => item.warehouseId === sourceWarehouse.id)?.quantity, 13);
        assert.equal(stock.find((item) => item.warehouseId === destinationWarehouse.id)?.quantity, 7);
        const ledger = await warehouseService.listStockLedger(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1, productId: product.id,
        });
        assert.equal(ledger.filter((entry) => entry.referenceId === transfer.id).length, 2);
        assert.equal((await productService.archive(
          database, ids.tenantA, ids.userA, product.id, ids.outletA1,
        )).archived, true);
      });
      let createdTeamUserId = "";
      let leaveTypeId = "";
      await withAppContext(client, ids.tenantA, ids.adminA, async () => {
        const database = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
        const configuration = await businessConfigurationService.save(database, ids.tenantA, ids.adminA, ids.outletA1,
          saveBusinessConfigurationSchema.parse({ businessModel: "b2b", vertical: "exports", templateVersion: "1.0.0", currency: "EUR" }));
        assert.equal(configuration.isConfigured, true);
        assert.equal(configuration.vertical, "exports");
        assert.equal(configuration.pipelineStages.length, 8);
        assert.ok(configuration.pipelineStages.some((stage) => stage.stageKey === "RFP"));
        assert.equal(configuration.customFields.length, 6);
        assert.ok(configuration.customFields.find((field) => field.fieldKey === "incoterm")?.options.includes("DPU"));
        const secondOutlet = await businessConfigurationService.get(database, ids.tenantA, ids.outletA2);
        assert.equal(secondOutlet.businessId, ids.businessA);
        assert.equal(secondOutlet.currency, "EUR");
        await businessConfigurationService.save(database, ids.tenantA, ids.adminA, ids.outletA1,
          saveBusinessConfigurationSchema.parse({ businessModel: "b2b", vertical: "exports", templateVersion: "1.0.0", currency: "EUR",
            pipelineStages: [{ stageKey: "NEGOTIATION", displayName: "Negotiation", stageOrder: 4, stageCategory: "OPEN", tabColor: "#112233" }],
          }));
        const created = await teamService.create(database, ids.tenantA, ids.adminA, true, {
          outletId: ids.outletA1,
          name: "PostgreSQL Sales User",
          email: "pg-sales@example.com",
          password: "integration-password-123",
          department: "SALES",
          roleInZone: "USER",
          zoneList: ["WEST", "NORTH"],
          empCode: "PG-SALES-1",
          isOnPayRoll: true,
          isActive: true,
        });
        createdTeamUserId = created.userId;
        assert.ok(created.teamMember);
        assert.deepEqual(created.teamMember?.zoneList.sort(), ["NORTH", "WEST"]);
        const listed = await teamService.list(database, ids.tenantA, ids.adminA, {
          outletId: ids.outletA1, department: "SALES", active: true, search: "PG-SALES-1", limit: 20,
        });
        assert.equal(listed.items.some((item) => item.userId === createdTeamUserId), true);
        const updated = await teamService.update(database, ids.tenantA, ids.adminA, createdTeamUserId, {
          outletId: ids.outletA1, department: "SALES", zoneList: ["CENTER"], isOnPayRoll: false,
        });
        assert.deepEqual(updated[0]?.zoneList, ["CENTER"]);
        assert.equal(updated[0]?.isOnPayRoll, false);
        const teamAccess = await new PostgresAuthorizationRepository().getCurrentAccess(database, createdTeamUserId, ids.tenantA);
        assert.equal(teamAccess.outlets[0]?.profileRole, "USER");
        assert.deepEqual(teamAccess.outlets[0]?.departments, ["SALES"]);
        assert.deepEqual(teamAccess.outlets[0]?.zones, ["CENTER"]);
        const secondOutletMembership = await teamService.addMembership(database, ids.tenantA, ids.adminA, createdTeamUserId, {
          outletId: ids.outletA2, department: "IT", roleInZone: "SUPPORT", zoneList: ["EAST"],
          empCode: "PG-SALES-1", isOnPayRoll: false, isActive: true,
        });
        assert.equal(secondOutletMembership[0]?.department, "IT");
        assert.deepEqual(secondOutletMembership[0]?.zoneList, ["EAST"]);
        const trackingTimestamp = Date.parse("2026-09-23T10:15:00.000+05:30");
        const trackingPoint = await postgresUserTrackingService.create(
          database, ids.tenantA, ids.adminA, {
            outletId: ids.outletA1,
            userId: createdTeamUserId,
            latitude: 19.076,
            longitude: 72.8777,
            address: "Mumbai",
            timestamp: trackingTimestamp,
            externalSource: "integration",
            externalId: "tracking-point-1",
          },
        );
        assert.equal(trackingPoint.userId, createdTeamUserId);
        const duplicateTrackingPoint = await postgresUserTrackingService.create(
          database, ids.tenantA, ids.adminA, {
            outletId: ids.outletA1,
            userId: createdTeamUserId,
            latitude: 19.076,
            longitude: 72.8777,
            address: "Mumbai",
            timestamp: trackingTimestamp,
            externalSource: "integration",
            externalId: "tracking-point-1",
          },
        );
        assert.equal(duplicateTrackingPoint.id, trackingPoint.id);
        const trackingHistory = await postgresUserTrackingService.listHistory(
          database, ids.tenantA, ids.adminA, {
            outletId: ids.outletA1,
            userId: createdTeamUserId,
            date: "2026-09-23",
            limit: 25,
          },
        );
        assert.equal(trackingHistory.items.length, 1);
        assert.equal(trackingHistory.items[0]?.timestamp, trackingTimestamp);
        const leaveType = await leaveService.createType(database, ids.tenantA, ids.adminA, {
          outletId: ids.outletA1, name: "Annual Leave", shortCode: "AL",
        });
        leaveTypeId = leaveType.item.id;
        const balance = await leaveService.updateBalance(database, ids.tenantA, ids.adminA, createdTeamUserId, {
          outletId: ids.outletA1, year: 2026, totalLeaves: 10, reason: "Integration allocation",
        });
        assert.equal(balance.item.remainingLeaves, 10);
      });

      let leaveRequestId = "";
      await withAppContext(client, ids.tenantA, createdTeamUserId, async () => {
        const database = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
        const request = await leaveService.createRequest(database, ids.tenantA, createdTeamUserId, {
          outletId: ids.outletA1, leaveTypeId,
          fromDate: Date.parse("2026-06-11T00:00:00.000+05:30"),
          toDate: Date.parse("2026-06-12T00:00:00.000+05:30"),
          duration: "Full Day", leaveNote: "Integration leave request",
        });
        leaveRequestId = request.item.id;
        assert.equal(request.item.status, "REQUESTED");
        assert.equal(request.item.noDays, 2);
        const balance = await client.query(
          "SELECT used_leaves::text, remaining_leaves::text FROM crm.leave_balances WHERE user_id=$1 AND year=2026",
          [createdTeamUserId],
        );
        assert.deepEqual(balance.rows[0], { used_leaves: "0.00", remaining_leaves: "10.00" });
      });

      await withAppContext(client, ids.tenantA, ids.adminA, async () => {
        const database = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
        await leaveService.transitionStatus(database, ids.tenantA, ids.adminA, leaveRequestId, {
          outletId: ids.outletA1, status: "APPROVED", remark: "Approved in integration",
        });
        await leaveService.transitionStatus(database, ids.tenantA, ids.adminA, leaveRequestId, {
          outletId: ids.outletA1, status: "APPROVED", remark: "Repeated approval",
        });
        let balance = await client.query(
          "SELECT used_leaves::text, remaining_leaves::text FROM crm.leave_balances WHERE user_id=$1 AND year=2026",
          [createdTeamUserId],
        );
        assert.deepEqual(balance.rows[0], { used_leaves: "2.00", remaining_leaves: "8.00" });
        assert.equal((await client.query(
          "SELECT count(*) FROM crm.leave_balance_entries WHERE leave_request_id=$1 AND entry_type='LEAVE_APPROVED'",
          [leaveRequestId],
        )).rows[0]?.count, "1");
        await leaveService.transitionStatus(database, ids.tenantA, ids.adminA, leaveRequestId, {
          outletId: ids.outletA1, status: "REJECTED", remark: "Reversed in integration",
        });
        await leaveService.transitionStatus(database, ids.tenantA, ids.adminA, leaveRequestId, {
          outletId: ids.outletA1, status: "REJECTED", remark: "Repeated rejection",
        });
        balance = await client.query(
          "SELECT used_leaves::text, remaining_leaves::text FROM crm.leave_balances WHERE user_id=$1 AND year=2026",
          [createdTeamUserId],
        );
        assert.deepEqual(balance.rows[0], { used_leaves: "0.00", remaining_leaves: "10.00" });
        assert.equal((await client.query(
          "SELECT count(*) FROM crm.leave_balance_entries WHERE leave_request_id=$1 AND entry_type='LEAVE_REVERSED'",
          [leaveRequestId],
        )).rows[0]?.count, "1");

        const expenseService = postgresExpenseService;
        await teamService.addMembership(database, ids.tenantA, ids.adminA, ids.adminA, {
          outletId: ids.outletA1,
          department: "SALES",
          roleInZone: "USER",
          zoneList: ["WEST"],
          empCode: "PG-ADMIN-1",
          isOnPayRoll: false,
          isActive: true,
        });
        const allocation = await expenseService.createAllocation(database, ids.tenantA, ids.adminA, {
          outletId: ids.outletA1,
          month: "2026-08",
          targetType: "DEPARTMENT",
          targetId: "SALES",
          allocatedAmount: 10_000,
        });
        assert.equal(allocation.created, true);
        assert.equal(allocation.allocation.remainingAmount, 10_000);
        const duplicate = await expenseService.createAllocation(database, ids.tenantA, ids.adminA, {
          outletId: ids.outletA1,
          month: "2026-08",
          targetType: "DEPARTMENT",
          targetId: "SALES",
          allocatedAmount: 10_000,
        });
        assert.equal(duplicate.created, false);
        const expense = await expenseService.createExpense(database, ids.tenantA, ids.adminA, {
          outletId: ids.outletA1,
          userId: createdTeamUserId,
          amount: 2_500,
          monthId: "2026-08",
          purpose: "Travel",
        });
        await expenseService.transitionExpense(database, ids.tenantA, ids.adminA, expense.id, {
          outletId: ids.outletA1, status: "REVIEWED",
        });
        const approved = await expenseService.transitionExpense(database, ids.tenantA, ids.adminA, expense.id, {
          outletId: ids.outletA1, status: "APPROVED",
        });
        assert.equal(approved.budgetApplied, true);
        assert.equal(approved.allocation?.usedAmount, 2_500);
        assert.equal(approved.allocation?.remainingAmount, 7_500);
        const summary = await expenseService.getSummary(database, ids.tenantA, ids.adminA, {
          outletId: ids.outletA1, month: "2026-08",
        });
        assert.equal(summary.totals.usedAmount, 2_500);
        assert.equal(summary.totals.remainingAmount, 7_500);
        assert.equal(summary.totals.approvedAmount, 2_500);

        const permissions = await postgresAccessControlService.listPermissions(
          database, ids.tenantA, ids.adminA, ids.outletA1,
        );
        assert.ok(permissions.some((permission) => permission.key === "CRM_LEADS_VIEW"));
        const createdPermission = await postgresAccessControlService.createPermission(
          database, ids.tenantA, ids.adminA, {
            outletId: ids.outletA1,
            key: "CRM_B10_CUSTOM",
            label: "B10 custom",
            description: "PostgreSQL access-control catalog entry",
            category: "Tests",
          },
        );
        assert.equal(createdPermission.key, "CRM_B10_CUSTOM");
        const users = await postgresAccessControlService.listUsers(
          database, ids.tenantA, ids.adminA, ids.outletA1,
        );
        assert.ok(users.some((user) => user.id === createdTeamUserId));
        const updatedAccess = await postgresAccessControlService.updateUserAccess(
          database, ids.tenantA, ids.adminA, createdTeamUserId, {
            outletId: ids.outletA1,
            role: "MANAGER",
            departmentAccessList: ["SALES", "HR"],
            outletPermissions: ["CRM_LEADS_VIEW", "CRM_TEAMTREE_VIEW"],
          },
        );
        assert.equal(updatedAccess.permissions[0]?.role, "MANAGER");
        assert.deepEqual(updatedAccess.permissions[0]?.departmentAccessList, ["SALES", "HR"]);
        assert.ok(updatedAccess.permissions[0]?.outletPermissions?.includes("CRM_LEADS_VIEW"));
        const teamDepartment = await client.query<{ department: string; zone: string | null; profile_role: string }>(`
          SELECT team.department, team.zone, profile.profile_role
          FROM crm.team_memberships team
          JOIN crm.user_profiles profile ON profile.id = team.user_profile_id AND profile.tenant_id = team.tenant_id
          WHERE team.tenant_id = $1 AND team.outlet_id = $2 AND team.user_id = $3
        `, [ids.tenantA, ids.outletA1, createdTeamUserId]);
        assert.equal(teamDepartment.rows[0]?.department, "SALES");
        assert.equal(teamDepartment.rows[0]?.zone, "CENTER");
        assert.equal(teamDepartment.rows[0]?.profile_role, "MANAGER");
        const grantedAccess = await new PostgresAuthorizationRepository().getCurrentAccess(
          database, createdTeamUserId, ids.tenantA,
        );
        assert.ok(grantedAccess.outlets[0]?.permissions.includes("leads.read"));
        assert.ok(grantedAccess.outlets[0]?.permissions.includes("CRM_LEADS_VIEW"));
        assert.equal(await new PostgresAuthorizationRepository().hasOutletPermission(
          database, createdTeamUserId, ids.tenantA, ids.outletA1, "leads.read",
        ), true);
        const features = await postgresAccessControlService.saveOutletFeatures(
          database, ids.tenantA, ids.adminA, ids.outletA1, ids.outletA1, {
            outletId: ids.outletA1,
            enabledFeatureKeys: ["dashboard", "leads", "permissions"],
            expectedRevision: 0,
          },
        );
        assert.equal(features.revision, 1);
        assert.deepEqual(features.enabledFeatureKeys, ["dashboard", "leads", "permissions"]);
        await assert.rejects(
          postgresAccessControlService.saveOutletFeatures(
            database, ids.tenantA, ids.adminA, ids.outletA1, ids.outletA1, {
              outletId: ids.outletA1,
              enabledFeatureKeys: ["dashboard"],
              expectedRevision: 0,
            },
          ),
          (error: unknown) => (error as { code?: string }).code === "FEATURE_ACCESS_CONFLICT",
        );
        const auditCount = await client.query(
          "SELECT count(*) FROM iam.access_control_audit WHERE tenant_id = $1",
          [ids.tenantA],
        );
        assert.ok(Number(auditCount.rows[0]?.count) >= 3);
      });

      let createdLeadId = "";
      await withAppContext(client, ids.tenantA, ids.userA, async () => {
        const database = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
        await assert.rejects(
          postgresAccessControlService.listPermissions(database, ids.tenantA, ids.userA, ids.outletA1),
          (error: unknown) => (error as { code?: string }).code === "PERMISSION_DENIED",
        );
        const lead = await leadService.create(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          customerName: "Lead One",
          businessName: "Lead One Business",
          mobile: "9123456789",
          email: "lead1@example.com",
          requirement: "Need 10 units",
          city: "Mumbai",
          state: "Maharashtra",
        });
        assert.ok(lead.id);
        createdLeadId = lead.id;
        assert.equal(lead.stage, "NEW");
        assert.equal(lead.customerId, null);

        assert.equal((await client.query("SELECT stage_id IS NOT NULL AS linked FROM crm.leads WHERE id=$1", [lead.id])).rows[0]?.linked, true);
        const negotiation = await leadService.changeStage(database, ids.tenantA, ids.userA, lead.id, { outletId: ids.outletA1, stage: "NEGOTIATION" });
        assert.equal(negotiation.stage, "NEGOTIATION");
        assert.equal((await client.query(`SELECT stage.stage_key FROM crm.leads lead JOIN crm.business_pipeline_stages stage ON stage.id=lead.stage_id WHERE lead.id=$1`, [lead.id])).rows[0]?.stage_key, "NEGOTIATION");
        const dynamicCounts = await leadService.getStageCounts(database, ids.tenantA, ids.userA, { outletId: ids.outletA1, startDate: Date.now() - 86_400_000, endDate: Date.now() + 86_400_000 });
        assert.equal(dynamicCounts.byStage?.NEGOTIATION, 1);
        await assert.rejects(leadService.changeStage(database, ids.tenantA, ids.userA, lead.id, { outletId: ids.outletA1, stage: "UNKNOWN_STAGE" }), (error: unknown) => (error as { code?: string }).code === "INVALID_PIPELINE_STAGE");
        await leadService.changeStage(database, ids.tenantA, ids.userA, lead.id, { outletId: ids.outletA1, stage: "NEW" });
        await assert.rejects(businessConfigurationService.save(database, ids.tenantA, ids.userA, ids.outletA1,
          saveBusinessConfigurationSchema.parse({ businessModel: "b2b", vertical: "exports", templateVersion: "1.0.0", currency: "USD" })),
          (error: unknown) => (error as { code?: string }).code === "BUSINESS_CONFIGURATION_FORBIDDEN");
        await assert.rejects(businessConfigurationService.get(database, ids.tenantA, ids.outletB),
          (error: unknown) => (error as { code?: string }).code === "OUTLET_NOT_FOUND");

        const quotation = await postgresQuotationService.create(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          leadId: lead.id,
          customerName: lead.customerName,
          customerMobile: lead.mobile,
          currencyCode: "EUR",
          incoterm: "CIF",
          terms: "Valid for 30 days",
          taxPercent: 18,
          items: [{
            productId: catalogProductId,
            productName: "Integration Product",
            quantity: 2,
            mrpUnitPrice: 125,
            unitPrice: 99.99,
          }],
        });
        assert.match(quotation.quotationNumber, /^QT-\d{8}-[A-F0-9]{32}$/);
        assert.equal(quotation.currencyCode, "EUR");
        assert.equal(quotation.incoterm, "CIF");
        assert.equal(quotation.subtotal, 199.98);
        assert.equal(quotation.discountAmount, 50.02);
        assert.equal(quotation.taxAmount, 36);
        assert.equal(quotation.totalAmount, 235.98);
        assert.equal(quotation.items[0]?.lineTotal, 235.98);
        const persistedQuotation = await client.query<{
          currency_code: string; subtotal: string; tax_amount: string; total_amount: string;
        }>(`SELECT currency_code, subtotal::text, tax_amount::text, total_amount::text
          FROM crm.quotations WHERE id=$1`, [quotation.id]);
        assert.deepEqual(persistedQuotation.rows[0], {
          currency_code: "EUR", subtotal: "199.98", tax_amount: "36.00", total_amount: "235.98",
        });
        assert.equal((await client.query(
          "SELECT count(*) FROM crm.quotation_items WHERE quotation_id=$1", [quotation.id],
        )).rows[0]?.count, "1");
        for (const currencyCode of ["USD", "INR"] as const) {
          const another = await postgresQuotationService.create(database, ids.tenantA, ids.userA, {
            outletId: ids.outletA1, leadId: lead.id, customerName: lead.customerName, currencyCode, incoterm: "DPU",
            items: [{ productName: "Second item", quantity: 1, mrpUnitPrice: 10, unitPrice: 10 }],
          });
          assert.notEqual(another.quotationNumber, quotation.quotationNumber);
          assert.equal(another.currencyCode, currencyCode);
          assert.equal(another.incoterm, "DPU");
        }

        const assigned = await leadService.assign(database, ids.tenantA, ids.userA, lead.id, {
          outletId: ids.outletA1,
          assignedTo: ids.userA,
          comments: "Assigned to user A",
        });
        assert.equal(assigned.stage, "ASSIGNED");
        assert.equal(assigned.assignedToUserId, ids.userA);
        assert.equal(assigned.assignedTo, ids.userA);
        const reassigned = await leadService.assign(database, ids.tenantA, ids.userA, lead.id, {
          outletId: ids.outletA1,
          assignedTo: createdTeamUserId,
          comments: "Assigned to PostgreSQL team member",
        });
        assert.equal(reassigned.assignedToUserId, createdTeamUserId);
        assert.equal(reassigned.assignedTo, createdTeamUserId);

        const updated = await leadService.update(database, ids.tenantA, ids.userA, lead.id, {
          outletId: ids.outletA1,
          priority: "High",
        });
        assert.equal(updated.priority, "High");

        const followUp = await activityService.create(database, ids.tenantA, ids.userA, lead.id, {
          outletId: ids.outletA1,
          assignedTo: ids.userA,
          description: "Call later atomically",
          mode: "Offline",
          priority: "High",
          productDealerPrice: 80,
          productId: "legacy-product-1",
          productMrpPrice: 100,
          productName: "Legacy product",
          productType: "Regular",
          scheduledDate: Date.now() + 3_600_000,
          type: "Follow Up",
          callLater: true,
        });
        assert.equal(followUp.type, "Follow Up");
        assert.equal(await new PostgresActivityRepository().update(database, ids.tenantA, ids.outletA2, followUp.id, { status: "DONE", completedAt: new Date(), updatedByUserId: ids.userA }), false);
        const followedUpLead = await leadService.getById(database, ids.tenantA, ids.userA, ids.outletA1, lead.id);
        assert.equal(followedUpLead.stage, "FOLLOWUP");
        assert.equal((await client.query("SELECT count(*) FROM crm.lead_stage_history WHERE lead_id = $1 AND to_stage = 'FOLLOWUP'", [lead.id])).rows[0]?.count, "1");

        const won = await leadService.changeStage(database, ids.tenantA, ids.userA, lead.id, {
          outletId: ids.outletA1,
          stage: "WON",
        });
        assert.equal(won.stage, "WON");
        assert.ok(won.customerId);

        const createdCustomer = await customerService.getById(database, ids.tenantA, ids.outletA1, won.customerId);
        assert.ok(createdCustomer);
        assert.equal(createdCustomer.mobile, "9123456789");

        const lead2 = await leadService.create(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          customerName: "Lead Two",
          businessName: "Lead One Business",
          mobile: "9123456789",
          email: "lead2@example.com",
          requirement: "Need 5 units",
        });

        const won2 = await leadService.changeStage(database, ids.tenantA, ids.userA, lead2.id, {
          outletId: ids.outletA1,
          stage: "WON",
        });
        assert.equal(won2.customerId, won.customerId);

        const repeated = await leadService.listRepeatedEnquiries(database, ids.tenantA, ids.userA, {
          outletId: ids.outletA1,
          startDate: Date.now() - 86400000,
          endDate: Date.now() + 86400000,
          limit: 10,
        });
        assert.ok(repeated.groups.length >= 1);
      });

      await withAppContext(client, ids.tenantB, ids.userB, async () => {
        const database = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
        const hiddenTeam = await client.query("SELECT id FROM crm.team_memberships WHERE tenant_id = $1", [ids.tenantA]);
        assert.equal(hiddenTeam.rowCount, 0);
        assert.equal((await client.query("SELECT id FROM crm.customers WHERE id = $1", [directCustomerId])).rowCount, 0);
        assert.equal((await client.query("SELECT id FROM crm.products WHERE id = $1", [catalogProductId])).rowCount, 0);
        assert.equal((await client.query(
          "SELECT id FROM crm.warehouses WHERE id IN ($1, $2)",
          [sourceWarehouseId, destinationWarehouseId],
        )).rowCount, 0);
        assert.equal((await client.query("SELECT user_id FROM iam.user_outlet_permissions")).rowCount, 0);
        assert.equal((await client.query("SELECT id FROM iam.access_control_audit")).rowCount, 0);
        await assert.rejects(
          leadService.getById(database, ids.tenantB, ids.userB, ids.outletB, createdLeadId),
          (error: unknown) => (error as { code?: string }).code === "LEAD_NOT_FOUND" || (error as { code?: string }).code === "PERMISSION_DENIED",
        );
      });

        const queued = await client.query<{ source_type: string; status: string; source_version: string }>(`
          SELECT source_type, status, source_version
          FROM crm.ai_retrieval_jobs
          WHERE tenant_id = $1 AND subject_lead_id = $2
          ORDER BY source_type, source_id
        `, [ids.tenantA, createdLeadId]);
        const leadJob = queued.rows.find((row) => row.source_type === "lead");
        assert.ok(leadJob, "lead changes enqueue a lead indexing job");
        assert.equal(queued.rows.filter((row) => row.source_type === "lead").length, 1,
          "repeated source updates retain one idempotent lead job");
        assert.equal(leadJob.status, "pending");
        assert.ok(queued.rows.filter((row) => row.source_type === "timeline").length >= 3,
          "timeline events enqueue deduplicated indexing jobs");

        const indexedJob = await client.query<{ source_version: string }>(`
          UPDATE crm.ai_retrieval_jobs
          SET status = 'indexed', provider = 'google',
            model = 'test-model', model_version = 'test-model-v1',
            last_successful_indexing_at = now()
          WHERE tenant_id = $1 AND source_type = 'lead' AND source_id = $2
          RETURNING source_version
        `, [ids.tenantA, createdLeadId]);
        const testVector = JSON.stringify(Array.from({ length: 768 }, () => 0.01));
        await client.query(`
          INSERT INTO crm.ai_retrieval_chunks (
            tenant_id, outlet_id, source_type, source_id, subject_lead_id,
            source_version, document_text, embedding, provider, model, model_version
          ) VALUES ($1, $2, 'lead', $3, $3, $4, $5, $6::vector, 'google',
            'test-model', 'test-model-v1')
        `, [
          ids.tenantA, ids.outletA1, createdLeadId, indexedJob.rows[0]?.source_version,
          "Requirement: Need 10 units in Mumbai", testVector,
        ]);

        const retrievalRepository = new PostgresAiRetrievalRepository();
        await withAppContext(client, ids.tenantA, ids.userA, async () => {
          const exactMatches = await retrievalRepository.exactLeadIds(
            { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase,
            ids.tenantA, ids.outletA1, "9123456789",
          );
          assert.deepEqual(exactMatches, [createdLeadId]);
          const ftsMatches = await retrievalRepository.fullTextLeadIds(
            { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase,
            ids.tenantA, ids.outletA1, "Need 10 units",
          );
          assert.deepEqual(ftsMatches, [createdLeadId]);
          const vectorMatches = await retrievalRepository.vectorLeadIds(
            { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase,
            ids.tenantA, ids.outletA1, Array.from({ length: 768 }, () => 0.01),
          );
          assert.deepEqual(vectorMatches, [createdLeadId]);
        });

        await withAppContext(client, ids.tenantA, ids.userA, async () => {
          await client.query(
            "UPDATE crm.leads SET requirement = 'Need 20 units' WHERE tenant_id = $1 AND id = $2",
            [ids.tenantA, createdLeadId],
          );
        });
        const refreshedJob = await client.query<{ status: string; source_version: string }>(`
          SELECT status, source_version FROM crm.ai_retrieval_jobs
          WHERE tenant_id = $1 AND source_type = 'lead' AND source_id = $2
        `, [ids.tenantA, createdLeadId]);
        assert.equal(refreshedJob.rows[0]?.status, "pending");
        assert.notEqual(refreshedJob.rows[0]?.source_version, indexedJob.rows[0]?.source_version,
          "source edits refresh the indexing version");
        await withAppContext(client, ids.tenantA, ids.userA, async () => {
          const staleMatches = await retrievalRepository.fullTextLeadIds(
            { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase,
            ids.tenantA, ids.outletA1, "Need 10 units",
          );
          assert.deepEqual(staleMatches, [], "stale chunks are hidden until source re-indexing completes");
        });

        const proposalInput = aiAgentActionProposalSchema.parse({
          outletId: ids.outletA1,
          actionType: "lead.stage_change",
          targetType: "lead",
          targetId: createdLeadId,
          decisionSummary: "Move lead to follow-up",
          reasonCodes: ["STALE_FOLLOW_UP"],
          contextRefs: [],
          proposedPayload: { stage: "FOLLOWUP" },
          idempotencyKey: "integration-action-123456",
        });
        let proposalId = "";
        await withAppContext(client, ids.tenantA, ids.userA, async () => {
          const transaction = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
          const proposal = await aiAgentActionsService.propose(
            transaction, ids.tenantA, ids.userA, proposalInput,
          );
          proposalId = proposal.action.id;
          assert.equal(proposal.action.status, "PROPOSED");
          const retry = await aiAgentActionsService.propose(
            transaction, ids.tenantA, ids.userA, proposalInput,
          );
          assert.equal(retry.action.id, proposalId);
          assert.equal(retry.replayed, true);
          await assert.rejects(
            aiAgentActionsService.review(
              transaction, ids.tenantA, ids.userA, ids.outletA1, proposalId, "approve",
            ),
            (error: unknown) => (error as { code?: string }).code === "AI_ACTION_SELF_REVIEW_DENIED",
          );
        });
        await withAppContext(client, ids.tenantA, ids.adminA, async () => {
          const transaction = { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase;
          const approved = await aiAgentActionsService.review(
            transaction, ids.tenantA, ids.adminA, ids.outletA1, proposalId, "approve", "Approved for mock validation",
          );
          assert.equal(approved.status, "APPROVED");
          const executed = await aiAgentActionsService.executeMock(
            transaction, ids.tenantA, ids.adminA, ids.outletA1, proposalId,
          );
          assert.equal(executed.action.status, "EXECUTED");
          assert.equal(executed.action.executionResult?.simulated, true);
          const currentLead = await client.query<{ stage: string }>(
            "SELECT stage::text FROM crm.leads WHERE tenant_id = $1 AND id = $2",
            [ids.tenantA, createdLeadId],
          );
          assert.equal(currentLead.rows[0]?.stage, "NEW", "mock execution never mutates source records");
          const history = await client.query<{
            event_type: string; actor_user_id: string; to_status: string;
          }>(`
            SELECT event_type, actor_user_id, to_status
            FROM crm.ai_agent_action_history
            WHERE tenant_id = $1 AND outlet_id = $2 AND action_id = $3
            ORDER BY created_at, id
          `, [ids.tenantA, ids.outletA1, proposalId]);
          assert.deepEqual(history.rows.map((row) => row.to_status), ["PROPOSED", "APPROVED", "EXECUTED"]);
          assert.deepEqual(history.rows.map((row) => row.actor_user_id), [ids.userA, ids.adminA, ids.adminA]);
          const replay = await aiAgentActionsService.executeMock(
            transaction, ids.tenantA, ids.adminA, ids.outletA1, proposalId,
          );
          assert.equal(replay.replayed, true);
        });
        await withAppContext(client, ids.tenantB, ids.userB, async () => {
          assert.equal((await client.query(
            "SELECT id FROM crm.ai_agent_actions WHERE tenant_id = $1",
            [ids.tenantA],
          )).rowCount, 0, "RLS excludes another tenant's AI actions");
        });

        await withAppContext(client, ids.tenantB, ids.userB, async () => {
          const crossTenantMatches = await retrievalRepository.fullTextLeadIds(
            { client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase,
            ids.tenantB, ids.outletB, "Need 10 units",
          );
          assert.deepEqual(crossTenantMatches, [], "RLS excludes another tenant's indexed lead");
        });
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
};

test("clean PostgreSQL migration rebuild and RLS security gate", { skip: !adminConnectionString }, async () => {
  assert.ok(adminConnectionString);
  const adminDatabaseUrl = databaseUrl(adminConnectionString, "postgres");
  const adminPool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const databaseName = `sensible_phase41_${randomBytes(6).toString("hex")}`;
      await adminPool.query(`CREATE DATABASE ${databaseName}`);
      try {
        await verifyFreshDatabase(databaseUrl(adminConnectionString, databaseName));
      } finally {
        await adminPool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [databaseName]);
        await adminPool.query(`DROP DATABASE ${databaseName}`);
      }
    }
  } finally {
    await adminPool.end();
  }
});
