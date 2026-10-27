SET TIME ZONE 'UTC';

CREATE TABLE crm.tasks (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  task_number varchar(80) NOT NULL,
  title varchar(300) NOT NULL,
  description text NOT NULL DEFAULT '',
  task_type varchar(80) NOT NULL DEFAULT 'GENERAL',
  priority varchar(16) NOT NULL DEFAULT 'MEDIUM',
  priority_rank smallint NOT NULL DEFAULT 2,
  status varchar(24) NOT NULL DEFAULT 'OPEN',
  assigned_to_user_id uuid,
  assigned_by_user_id uuid,
  assigned_at timestamptz,
  assigned_to_department varchar(120) NOT NULL DEFAULT '',
  task_date date NOT NULL DEFAULT current_date,
  due_at timestamptz NOT NULL,
  outlet_time_zone varchar(80) NOT NULL DEFAULT 'Asia/Kolkata',
  progress_percent smallint NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT tasks_tenant_outlet_number_uq UNIQUE (tenant_id, outlet_id, task_number),
  CONSTRAINT tasks_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tasks_assignee_membership_fk FOREIGN KEY (tenant_id, assigned_to_user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT tasks_assigner_membership_fk FOREIGN KEY (tenant_id, assigned_by_user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT tasks_creator_membership_fk FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT tasks_updater_membership_fk FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT tasks_title_ck CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  CONSTRAINT tasks_priority_ck CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  CONSTRAINT tasks_priority_rank_ck CHECK (priority_rank BETWEEN 1 AND 4),
  CONSTRAINT tasks_status_ck CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  CONSTRAINT tasks_progress_ck CHECK (progress_percent BETWEEN 0 AND 100),
  CONSTRAINT tasks_version_ck CHECK (version > 0),
  CONSTRAINT tasks_assignment_ck CHECK (
    (assigned_to_user_id IS NULL AND assigned_by_user_id IS NULL AND assigned_at IS NULL)
    OR (assigned_to_user_id IS NOT NULL AND assigned_by_user_id IS NOT NULL AND assigned_at IS NOT NULL)
  )
);

CREATE TABLE crm.task_status_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  task_id uuid NOT NULL,
  action varchar(40) NOT NULL,
  from_status varchar(24),
  to_status varchar(24) NOT NULL,
  reason varchar(1000) NOT NULL DEFAULT '',
  changed_by_user_id uuid NOT NULL,
  changed_by_name varchar(300) NOT NULL DEFAULT '',
  old_value jsonb,
  new_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_status_history_task_tenant_fk FOREIGN KEY (tenant_id, task_id)
    REFERENCES crm.tasks(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT task_status_history_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT task_status_history_actor_membership_fk FOREIGN KEY (tenant_id, changed_by_user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT task_status_history_action_ck CHECK (action IN ('CREATED','UPDATED','ASSIGNED','STATUS_CHANGED','DELETED')),
  CONSTRAINT task_status_history_from_status_ck CHECK (
    from_status IS NULL OR from_status IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')
  ),
  CONSTRAINT task_status_history_to_status_ck CHECK (
    to_status IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')
  ),
  CONSTRAINT task_status_history_old_value_ck CHECK (old_value IS NULL OR jsonb_typeof(old_value) = 'object'),
  CONSTRAINT task_status_history_new_value_ck CHECK (jsonb_typeof(new_value) = 'object')
);

CREATE INDEX tasks_outlet_updated_idx ON crm.tasks (tenant_id, outlet_id, updated_at DESC, id DESC);
CREATE INDEX tasks_assignee_due_idx ON crm.tasks (tenant_id, outlet_id, assigned_to_user_id, due_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX tasks_status_due_idx ON crm.tasks (tenant_id, outlet_id, status, due_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX task_status_history_task_changed_idx
  ON crm.task_status_history (tenant_id, outlet_id, task_id, changed_at DESC, id DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE crm.tasks OWNER TO sensible_rls_owner;
ALTER TABLE crm.task_status_history OWNER TO sensible_rls_owner;

INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category) VALUES
  ('tasks.read','View tasks and task history','CRM_TASK_VIEW','View tasks','Tasks'),
  ('tasks.create','Create tasks','CRM_TASK_CREATE','Create tasks','Tasks'),
  ('tasks.update','Update task details and status','CRM_TASK_UPDATE','Update tasks','Tasks'),
  ('tasks.assign','Assign tasks to employees','CRM_TASK_ASSIGN','Assign tasks','Tasks'),
  ('tasks.delete','Archive tasks','CRM_TASK_DELETE','Delete tasks','Tasks')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = COALESCE(iam.permissions.catalog_key, EXCLUDED.catalog_key),
  label = COALESCE(iam.permissions.label, EXCLUDED.label),
  category = COALESCE(iam.permissions.category, EXCLUDED.category);

ALTER TABLE crm.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.task_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.task_status_history FORCE ROW LEVEL SECURITY;

CREATE POLICY tasks_select ON crm.tasks FOR SELECT USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND (
    assigned_to_user_id = iam.current_user_id()
    OR created_by_user_id = iam.current_user_id()
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.read')
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.update')
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.assign')
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.delete')
  )
);
CREATE POLICY tasks_insert ON crm.tasks FOR INSERT WITH CHECK (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND created_by_user_id = iam.current_user_id()
  AND updated_by_user_id = iam.current_user_id()
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.create')
);
CREATE POLICY tasks_update ON crm.tasks FOR UPDATE USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND (
    assigned_to_user_id = iam.current_user_id()
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.update')
    OR iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.delete')
  )
) WITH CHECK (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND updated_by_user_id = iam.current_user_id()
);

CREATE POLICY task_status_history_select ON crm.task_status_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM crm.tasks task
    WHERE task.tenant_id = task_status_history.tenant_id
      AND task.id = task_status_history.task_id
  )
);
CREATE POLICY task_status_history_insert ON crm.task_status_history FOR INSERT WITH CHECK (
  changed_by_user_id = iam.current_user_id()
  AND tenancy.can_access_outlet(tenant_id, outlet_id)
  AND EXISTS (
    SELECT 1 FROM crm.tasks task
    WHERE task.tenant_id = task_status_history.tenant_id
      AND task.id = task_status_history.task_id
  )
);

GRANT SELECT, INSERT, UPDATE ON crm.tasks TO sensible_app_role;
GRANT SELECT, INSERT ON crm.task_status_history TO sensible_app_role;
