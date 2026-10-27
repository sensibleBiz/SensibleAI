SET TIME ZONE 'UTC';

DO $$ BEGIN
  CREATE TYPE crm.attendance_event_type AS ENUM ('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm.leave_status AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE crm.attendance_events (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  device_id varchar(200) NOT NULL DEFAULT '',
  device_user_id varchar(200),
  event_type crm.attendance_event_type NOT NULL,
  event_at timestamptz NOT NULL,
  source varchar(100) NOT NULL DEFAULT 'BIOMETRIC',
  external_event_id varchar(1500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_events_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT attendance_events_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT attendance_events_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX attendance_events_idempotency_idx
  ON crm.attendance_events (tenant_id, device_id, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX attendance_events_user_event_idx ON crm.attendance_events (tenant_id, outlet_id, user_id, event_at DESC);

CREATE TABLE crm.attendance_daily (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  day_id varchar(10) NOT NULL,
  month_id varchar(7) NOT NULL,
  year_id varchar(4) NOT NULL,
  check_in_time bigint,
  check_out_time bigint,
  is_present boolean NOT NULL DEFAULT true,
  emp_code varchar(100) NOT NULL DEFAULT '',
  user_name varchar(500) NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_daily_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT attendance_daily_user_day_uq UNIQUE (tenant_id, outlet_id, user_id, day_id),
  CONSTRAINT attendance_daily_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT attendance_daily_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX attendance_daily_outlet_day_idx ON crm.attendance_daily (tenant_id, outlet_id, day_id);
CREATE INDEX attendance_daily_outlet_month_idx ON crm.attendance_daily (tenant_id, outlet_id, month_id, user_id);

CREATE TABLE crm.leave_types (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  name varchar(200) NOT NULL,
  short_code varchar(20) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_types_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT leave_types_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT leave_types_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT leave_types_outlet_name_uq UNIQUE (tenant_id, outlet_id, name),
  CONSTRAINT leave_types_outlet_code_uq UNIQUE (tenant_id, outlet_id, short_code)
);

CREATE TABLE crm.leave_requests (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  leave_type varchar(200) NOT NULL,
  from_date bigint NOT NULL,
  to_date bigint NOT NULL,
  duration varchar(100) NOT NULL DEFAULT '',
  leave_note text NOT NULL DEFAULT '',
  no_days integer NOT NULL DEFAULT 0,
  status crm.leave_status NOT NULL DEFAULT 'REQUESTED',
  manager_user_id uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  manager_name varchar(500) NOT NULL DEFAULT '',
  action_taken_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  remark text,
  day_id varchar(10) NOT NULL DEFAULT '',
  month_id varchar(7) NOT NULL DEFAULT '',
  created_date bigint NOT NULL,
  updated_date bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT leave_requests_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT leave_requests_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX leave_requests_outlet_created_idx ON crm.leave_requests (tenant_id, outlet_id, created_date DESC, id DESC);
CREATE INDEX leave_requests_outlet_status_idx ON crm.leave_requests (tenant_id, outlet_id, status, created_date DESC);

CREATE TABLE crm.leave_balances (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  year integer NOT NULL,
  total_leaves numeric(8,2) NOT NULL DEFAULT 0,
  used_leaves numeric(8,2) NOT NULL DEFAULT 0,
  remaining_leaves numeric(8,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  last_updated bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_balances_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT leave_balances_user_year_uq UNIQUE (tenant_id, outlet_id, user_id, year),
  CONSTRAINT leave_balances_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE crm.holidays (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  name varchar(200) NOT NULL,
  title varchar(200),
  holiday_date date NOT NULL,
  date_string varchar(10),
  year varchar(4) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_paid boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT holidays_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT holidays_business_tenant_fk FOREIGN KEY (tenant_id, business_id) REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT holidays_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX holidays_outlet_year_idx ON crm.holidays (tenant_id, outlet_id, year, holiday_date);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.attendance_daily FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.leave_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.leave_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.holidays FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION crm.can_access_attendance(requested_tenant_id uuid, requested_outlet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND tenancy.can_access_outlet(requested_tenant_id, requested_outlet_id)
$$;
ALTER FUNCTION crm.can_access_attendance(uuid, uuid) OWNER TO sensible_rls_owner;

ALTER TABLE crm.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.attendance_events FORCE ROW LEVEL SECURITY;
CREATE POLICY attendance_events_select ON crm.attendance_events FOR SELECT USING (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY attendance_events_insert ON crm.attendance_events FOR INSERT WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));

ALTER TABLE crm.attendance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.attendance_daily FORCE ROW LEVEL SECURITY;
CREATE POLICY attendance_daily_select ON crm.attendance_daily FOR SELECT USING (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY attendance_daily_insert ON crm.attendance_daily FOR INSERT WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY attendance_daily_update ON crm.attendance_daily FOR UPDATE USING (crm.can_access_attendance(tenant_id, outlet_id)) WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY attendance_daily_delete ON crm.attendance_daily FOR DELETE USING (crm.can_access_attendance(tenant_id, outlet_id));

ALTER TABLE crm.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leave_types FORCE ROW LEVEL SECURITY;
CREATE POLICY leave_types_select ON crm.leave_types FOR SELECT USING (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY leave_types_insert ON crm.leave_types FOR INSERT WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));

ALTER TABLE crm.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leave_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY leave_requests_select ON crm.leave_requests FOR SELECT USING (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY leave_requests_insert ON crm.leave_requests FOR INSERT WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY leave_requests_update ON crm.leave_requests FOR UPDATE USING (crm.can_access_attendance(tenant_id, outlet_id)) WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));

ALTER TABLE crm.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.leave_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY leave_balances_select ON crm.leave_balances FOR SELECT USING (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY leave_balances_insert ON crm.leave_balances FOR INSERT WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY leave_balances_update ON crm.leave_balances FOR UPDATE USING (crm.can_access_attendance(tenant_id, outlet_id)) WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));

ALTER TABLE crm.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.holidays FORCE ROW LEVEL SECURITY;
CREATE POLICY holidays_select ON crm.holidays FOR SELECT USING (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY holidays_insert ON crm.holidays FOR INSERT WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));
CREATE POLICY holidays_update ON crm.holidays FOR UPDATE USING (crm.can_access_attendance(tenant_id, outlet_id)) WITH CHECK (crm.can_access_attendance(tenant_id, outlet_id));

INSERT INTO iam.permissions (permission_key, description) VALUES
  ('attendance.read', 'View PostgreSQL attendance'),
  ('attendance.delete', 'Delete PostgreSQL attendance records'),
  ('attendance.events.ingest', 'Ingest PostgreSQL attendance device events'),
  ('leave.read', 'View PostgreSQL leave applications'),
  ('leave.create', 'Create PostgreSQL leave types'),
  ('leave.manage', 'Approve or reject PostgreSQL leave applications')
ON CONFLICT (permission_key) DO NOTHING;
