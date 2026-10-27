SET TIME ZONE 'UTC';

DO $$ BEGIN
  CREATE TYPE crm.payroll_run_status AS ENUM (
    'DRAFT', 'GENERATED', 'CALCULATED', 'VALIDATED', 'APPROVED', 'LOCKED',
    'BANK_FILE_GENERATED', 'PAID', 'REVERSED', 'CORRECTION_RUN', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE crm.employee_salary_structures (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  emp_code varchar(100) NOT NULL DEFAULT '',
  gross_salary numeric(14, 2) NOT NULL DEFAULT 0,
  monthly_salary numeric(14, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_salary_structures_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT employee_salary_structures_outlet_user_uq UNIQUE (tenant_id, outlet_id, user_id),
  CONSTRAINT employee_salary_structures_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT employee_salary_structures_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX employee_salary_structures_outlet_active_idx
  ON crm.employee_salary_structures (tenant_id, outlet_id, is_active);

CREATE TABLE crm.salary_structure_revisions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  structure_id uuid NOT NULL,
  effective_from date NOT NULL,
  salary_structure jsonb NOT NULL,
  updated_at bigint NOT NULL,
  updated_by uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  CONSTRAINT salary_structure_revisions_structure_fk FOREIGN KEY (tenant_id, structure_id)
    REFERENCES crm.employee_salary_structures(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT salary_structure_revisions_effective_uq UNIQUE (tenant_id, structure_id, effective_from)
);

CREATE TABLE crm.payroll_runs (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  payroll_key varchar(200) NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  status crm.payroll_run_status NOT NULL DEFAULT 'GENERATED',
  calculation_hash varchar(128) NOT NULL DEFAULT '',
  gross_salary numeric(14, 2) NOT NULL DEFAULT 0,
  net_salary numeric(14, 2) NOT NULL DEFAULT 0,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT payroll_runs_outlet_key_uq UNIQUE (tenant_id, outlet_id, payroll_key),
  CONSTRAINT payroll_runs_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_runs_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX payroll_runs_employee_period_idx
  ON crm.payroll_runs (tenant_id, outlet_id, user_id, year DESC, month DESC);

CREATE TABLE crm.payroll_run_summaries (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, outlet_id, user_id),
  CONSTRAINT payroll_run_summaries_run_fk FOREIGN KEY (tenant_id, payroll_run_id)
    REFERENCES crm.payroll_runs(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT payroll_run_summaries_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.employee_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_payroll(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND tenancy.can_access_outlet(requested_tenant_id, requested_outlet_id)
$$;
ALTER FUNCTION crm.can_access_payroll(uuid, uuid) OWNER TO sensible_rls_owner;

ALTER TABLE crm.employee_salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.employee_salary_structures FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_salary_structures_select ON crm.employee_salary_structures
  FOR SELECT USING (crm.can_access_payroll(tenant_id, outlet_id));
CREATE POLICY employee_salary_structures_insert ON crm.employee_salary_structures
  FOR INSERT WITH CHECK (crm.can_access_payroll(tenant_id, outlet_id));
CREATE POLICY employee_salary_structures_update ON crm.employee_salary_structures
  FOR UPDATE USING (crm.can_access_payroll(tenant_id, outlet_id))
  WITH CHECK (crm.can_access_payroll(tenant_id, outlet_id));

ALTER TABLE crm.salary_structure_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.salary_structure_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY salary_structure_revisions_select ON crm.salary_structure_revisions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM crm.employee_salary_structures s
    WHERE s.tenant_id = salary_structure_revisions.tenant_id
      AND s.id = salary_structure_revisions.structure_id
      AND crm.can_access_payroll(s.tenant_id, s.outlet_id)
  ));
CREATE POLICY salary_structure_revisions_insert ON crm.salary_structure_revisions
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM crm.employee_salary_structures s
    WHERE s.tenant_id = salary_structure_revisions.tenant_id
      AND s.id = salary_structure_revisions.structure_id
      AND crm.can_access_payroll(s.tenant_id, s.outlet_id)
  ));

ALTER TABLE crm.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.payroll_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_runs_select ON crm.payroll_runs
  FOR SELECT USING (crm.can_access_payroll(tenant_id, outlet_id));
CREATE POLICY payroll_runs_insert ON crm.payroll_runs
  FOR INSERT WITH CHECK (crm.can_access_payroll(tenant_id, outlet_id));
CREATE POLICY payroll_runs_update ON crm.payroll_runs
  FOR UPDATE USING (crm.can_access_payroll(tenant_id, outlet_id))
  WITH CHECK (crm.can_access_payroll(tenant_id, outlet_id));

ALTER TABLE crm.payroll_run_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.payroll_run_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_run_summaries_select ON crm.payroll_run_summaries
  FOR SELECT USING (crm.can_access_payroll(tenant_id, outlet_id));
CREATE POLICY payroll_run_summaries_insert ON crm.payroll_run_summaries
  FOR INSERT WITH CHECK (crm.can_access_payroll(tenant_id, outlet_id));
CREATE POLICY payroll_run_summaries_update ON crm.payroll_run_summaries
  FOR UPDATE USING (crm.can_access_payroll(tenant_id, outlet_id))
  WITH CHECK (crm.can_access_payroll(tenant_id, outlet_id));

INSERT INTO iam.permissions (permission_key, description) VALUES
  ('payroll.read', 'View PostgreSQL payroll and salary structures'),
  ('payroll.manage', 'Create and update PostgreSQL salary structures and payroll runs')
ON CONFLICT (permission_key) DO NOTHING;

GRANT EXECUTE ON FUNCTION crm.can_access_payroll(uuid, uuid) TO sensible_app_role;
