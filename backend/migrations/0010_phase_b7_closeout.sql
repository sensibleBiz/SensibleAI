SET TIME ZONE 'UTC';

ALTER TABLE crm.leave_requests
  ADD COLUMN IF NOT EXISTS leave_type_id uuid REFERENCES crm.leave_types(id) ON DELETE RESTRICT;

ALTER TABLE crm.leave_requests
  ALTER COLUMN no_days TYPE numeric(8,2) USING no_days::numeric;

ALTER TABLE crm.holidays
  ADD COLUMN IF NOT EXISTS holiday_type varchar(30) NOT NULL DEFAULT 'NATIONAL',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS applicable_states text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS applicable_outlets uuid[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS holidays_active_outlet_date_uq
  ON crm.holidays (tenant_id, outlet_id, holiday_date)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS crm.leave_balance_entries (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  delta numeric(8,2) NOT NULL,
  entry_type varchar(40) NOT NULL,
  leave_request_id uuid REFERENCES crm.leave_requests(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  actor_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_balance_entries_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT leave_balance_entries_outlet_tenant_fk
    FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT leave_balance_entries_type_ck
    CHECK (entry_type IN ('ALLOCATION', 'ADMIN_ADJUSTMENT', 'LEAVE_APPROVED', 'LEAVE_REVERSED'))
);

CREATE INDEX IF NOT EXISTS leave_balance_entries_user_year_idx
  ON crm.leave_balance_entries (tenant_id, outlet_id, user_id, year, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS leave_balance_entries_request_type_uq
  ON crm.leave_balance_entries (tenant_id, leave_request_id, entry_type)
  WHERE leave_request_id IS NOT NULL;

ALTER TABLE crm.leave_balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leave_balance_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY leave_balance_entries_select ON crm.leave_balance_entries
  FOR SELECT USING (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY leave_balance_entries_insert ON crm.leave_balance_entries
  FOR INSERT WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));
