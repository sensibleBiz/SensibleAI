SET TIME ZONE 'UTC';

DO $$ BEGIN
  CREATE TYPE crm.expense_status AS ENUM ('PENDING', 'REVIEWED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.expense_budget_target_type AS ENUM ('DEPARTMENT', 'USER', 'MANAGER_TEAM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.expense_budget_transaction_type AS ENUM (
    'ALLOCATION_CREATED',
    'ALLOCATION_ADJUSTED',
    'EXPENSE_APPROVED',
    'EXPENSE_APPROVAL_REVERSED',
    'EXPENSE_AMOUNT_ADJUSTED',
    'APPROVED_EXPENSE_DELETED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE crm.expense_categories (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  category varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_categories_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expense_categories_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_categories_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_categories_outlet_name_uq UNIQUE (tenant_id, outlet_id, category)
);

CREATE TABLE crm.expense_budget_allocations (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  allocation_key varchar(500) NOT NULL,
  month varchar(7) NOT NULL,
  target_type crm.expense_budget_target_type NOT NULL,
  target_id varchar(200) NOT NULL,
  target_label varchar(500) NOT NULL,
  original_allocated_amount numeric(14, 2) NOT NULL,
  allocated_amount numeric(14, 2) NOT NULL,
  used_amount numeric(14, 2) NOT NULL DEFAULT 0,
  remaining_amount numeric(14, 2) NOT NULL,
  approved_expense_count integer NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'INR',
  notes varchar(500),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  revision integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at_ms bigint NOT NULL,
  updated_by uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_at_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_budget_allocations_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expense_budget_allocations_outlet_key_uq UNIQUE (tenant_id, outlet_id, allocation_key),
  CONSTRAINT expense_budget_allocations_month_target_uq UNIQUE (tenant_id, outlet_id, month, target_type, target_id),
  CONSTRAINT expense_budget_allocations_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_budget_allocations_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_budget_allocations_month_ck CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT expense_budget_allocations_status_ck CHECK (status = 'ACTIVE'),
  CONSTRAINT expense_budget_allocations_amounts_ck CHECK (
    allocated_amount >= 0 AND used_amount >= 0 AND original_allocated_amount >= 0
    AND approved_expense_count >= 0 AND revision >= 1
  )
);

CREATE INDEX expense_budget_allocations_outlet_month_idx
  ON crm.expense_budget_allocations (tenant_id, outlet_id, month);

CREATE TABLE crm.expense_budget_transactions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL,
  transaction_key varchar(200) NOT NULL,
  type crm.expense_budget_transaction_type NOT NULL,
  amount numeric(14, 2) NOT NULL,
  balance_after numeric(14, 2) NOT NULL,
  allocated_amount_after numeric(14, 2) NOT NULL,
  expense_id uuid,
  employee_id uuid,
  employee_name varchar(500),
  category_id uuid,
  category varchar(200),
  expense_status crm.expense_status,
  reason varchar(500),
  created_by uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_by_name varchar(500),
  created_at_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_budget_transactions_allocation_fk FOREIGN KEY (tenant_id, allocation_id)
    REFERENCES crm.expense_budget_allocations(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_budget_transactions_key_uq UNIQUE (tenant_id, allocation_id, transaction_key)
);

CREATE INDEX expense_budget_transactions_allocation_created_idx
  ON crm.expense_budget_transactions (tenant_id, allocation_id, created_at_ms DESC);

CREATE TABLE crm.expenses (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL,
  month_id varchar(7) NOT NULL,
  status crm.expense_status NOT NULL DEFAULT 'PENDING',
  category_id uuid,
  purpose varchar(500) NOT NULL DEFAULT '',
  created_date bigint NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at bigint,
  approved_by uuid,
  approved_at bigint,
  rejected_by uuid,
  rejected_at bigint,
  rejection_reason varchar(500),
  status_changed_by uuid,
  status_changed_at bigint,
  status_version integer NOT NULL DEFAULT 0,
  budget_applied boolean NOT NULL DEFAULT false,
  budget_allocation_id uuid,
  budget_applied_amount numeric(14, 2),
  budget_version integer,
  last_budget_allocation_id uuid,
  update_date bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT expenses_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expenses_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expenses_category_fk FOREIGN KEY (tenant_id, category_id)
    REFERENCES crm.expense_categories(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT expenses_budget_allocation_fk FOREIGN KEY (tenant_id, budget_allocation_id)
    REFERENCES crm.expense_budget_allocations(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expenses_month_ck CHECK (month_id ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT expenses_amount_ck CHECK (amount > 0),
  CONSTRAINT expenses_status_version_ck CHECK (status_version >= 0)
);

CREATE INDEX expenses_outlet_created_idx
  ON crm.expenses (tenant_id, outlet_id, created_date DESC);
CREATE INDEX expenses_outlet_month_idx
  ON crm.expenses (tenant_id, outlet_id, month_id, status);

CREATE TABLE crm.expense_status_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL,
  history_key varchar(80) NOT NULL,
  from_status crm.expense_status NOT NULL,
  to_status crm.expense_status NOT NULL,
  reason varchar(500),
  allocation_id uuid,
  changed_by uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  changed_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_status_history_expense_fk FOREIGN KEY (tenant_id, expense_id)
    REFERENCES crm.expenses(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT expense_status_history_key_uq UNIQUE (tenant_id, expense_id, history_key)
);

CREATE INDEX expense_status_history_expense_changed_idx
  ON crm.expense_status_history (tenant_id, expense_id, changed_at DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.expense_budget_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_expense(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND tenancy.can_access_outlet(requested_tenant_id, requested_outlet_id)
$$;
ALTER FUNCTION crm.can_access_expense(uuid, uuid) OWNER TO sensible_rls_owner;

ALTER TABLE crm.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.expense_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_categories_select ON crm.expense_categories
  FOR SELECT USING (crm.can_access_expense(tenant_id, outlet_id));
CREATE POLICY expense_categories_insert ON crm.expense_categories
  FOR INSERT WITH CHECK (crm.can_access_expense(tenant_id, outlet_id));
CREATE POLICY expense_categories_update ON crm.expense_categories
  FOR UPDATE USING (crm.can_access_expense(tenant_id, outlet_id))
  WITH CHECK (crm.can_access_expense(tenant_id, outlet_id));

ALTER TABLE crm.expense_budget_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.expense_budget_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_budget_allocations_select ON crm.expense_budget_allocations
  FOR SELECT USING (crm.can_access_expense(tenant_id, outlet_id));
CREATE POLICY expense_budget_allocations_insert ON crm.expense_budget_allocations
  FOR INSERT WITH CHECK (crm.can_access_expense(tenant_id, outlet_id));
CREATE POLICY expense_budget_allocations_update ON crm.expense_budget_allocations
  FOR UPDATE USING (crm.can_access_expense(tenant_id, outlet_id))
  WITH CHECK (crm.can_access_expense(tenant_id, outlet_id));

ALTER TABLE crm.expense_budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.expense_budget_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_budget_transactions_select ON crm.expense_budget_transactions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM crm.expense_budget_allocations a
    WHERE a.tenant_id = expense_budget_transactions.tenant_id
      AND a.id = expense_budget_transactions.allocation_id
      AND crm.can_access_expense(a.tenant_id, a.outlet_id)
  ));
CREATE POLICY expense_budget_transactions_insert ON crm.expense_budget_transactions
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM crm.expense_budget_allocations a
    WHERE a.tenant_id = expense_budget_transactions.tenant_id
      AND a.id = expense_budget_transactions.allocation_id
      AND crm.can_access_expense(a.tenant_id, a.outlet_id)
  ));

ALTER TABLE crm.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY expenses_select ON crm.expenses
  FOR SELECT USING (crm.can_access_expense(tenant_id, outlet_id));
CREATE POLICY expenses_insert ON crm.expenses
  FOR INSERT WITH CHECK (crm.can_access_expense(tenant_id, outlet_id));
CREATE POLICY expenses_update ON crm.expenses
  FOR UPDATE USING (crm.can_access_expense(tenant_id, outlet_id))
  WITH CHECK (crm.can_access_expense(tenant_id, outlet_id));
CREATE POLICY expenses_delete ON crm.expenses
  FOR DELETE USING (crm.can_access_expense(tenant_id, outlet_id));

ALTER TABLE crm.expense_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.expense_status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_status_history_select ON crm.expense_status_history
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM crm.expenses e
    WHERE e.tenant_id = expense_status_history.tenant_id
      AND e.id = expense_status_history.expense_id
      AND crm.can_access_expense(e.tenant_id, e.outlet_id)
  ));
CREATE POLICY expense_status_history_insert ON crm.expense_status_history
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM crm.expenses e
    WHERE e.tenant_id = expense_status_history.tenant_id
      AND e.id = expense_status_history.expense_id
      AND crm.can_access_expense(e.tenant_id, e.outlet_id)
  ));

INSERT INTO iam.permissions (permission_key, description) VALUES
  ('expense.read', 'View PostgreSQL expense budgets and claims'),
  ('expense.review', 'Review PostgreSQL expenses'),
  ('expense.approve', 'Approve or reject PostgreSQL expenses'),
  ('expense.delete', 'Delete PostgreSQL expenses'),
  ('expense.budget.allocate', 'Create and adjust PostgreSQL expense budget allocations'),
  ('expense.budget.overspend', 'Allow PostgreSQL expense budget overspend')
ON CONFLICT (permission_key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  crm.expense_categories,
  crm.expense_budget_allocations,
  crm.expense_budget_transactions,
  crm.expenses,
  crm.expense_status_history
TO sensible_app_role;

GRANT SELECT ON
  crm.expense_categories,
  crm.expense_budget_allocations,
  crm.expense_budget_transactions,
  crm.expenses,
  crm.expense_status_history
TO sensible_rls_owner;

GRANT EXECUTE ON FUNCTION crm.can_access_expense(uuid, uuid) TO sensible_app_role;
GRANT EXECUTE ON FUNCTION crm.can_access_expense(uuid, uuid) TO sensible_app_role;
