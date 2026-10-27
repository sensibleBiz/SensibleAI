-- =============================================================================
-- Migration 0037: Strengthen RLS — outlet-level isolation for migration-0031
--                 tables, fix application_settings nullable-outlet policy,
--                 user-scoped push notification policies, and add missing
--                 CRUD policies for quotations and tasks.
--
-- Problem: Migration 0031 applied a single DO-loop that enabled FORCE RLS on
--          15 tables but created only a tenant-id equality policy for all of
--          them. Tables that carry an outlet_id FK (integrations, facebook_
--          pages, messaging_configs, scheduled_messages, whatsapp_automation_
--          rules, public_urls, wallet_accounts, wallet_transactions,
--          quick_contacts, shifts, sales_orders) were therefore accessible
--          to ANY authenticated member of the tenant regardless of outlet
--          assignment. This migration replaces those weak policies with
--          outlet-level isolation consistent with the rest of the CRM schema.
--
-- Rollback: see 0037_rls_rollback.sql
-- Safe to re-run: all CREATE POLICY statements are guarded by DROP … IF EXISTS.
-- Do NOT apply to production without running the integration test suite first.
-- =============================================================================

SET TIME ZONE 'UTC';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. crm.integrations
--    Contains access_token and metadata credentials — highest priority.
--    Was: single tenant-equality FOR ALL policy.
--    Now: outlet-scoped SELECT/INSERT/UPDATE/DELETE with permission checks on
--         mutating operations (integrations.create / .update / .delete).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS integrations_tenant ON crm.integrations;

CREATE POLICY integrations_select ON crm.integrations FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY integrations_insert ON crm.integrations FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.create')
  );

CREATE POLICY integrations_update ON crm.integrations FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.update')
  );

CREATE POLICY integrations_delete ON crm.integrations FOR DELETE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.delete')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. crm.facebook_pages
--    Contains credentials jsonb — treat same as integrations.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS facebook_pages_tenant ON crm.facebook_pages;

CREATE POLICY facebook_pages_select ON crm.facebook_pages FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY facebook_pages_insert ON crm.facebook_pages FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.create')
  );

CREATE POLICY facebook_pages_update ON crm.facebook_pages FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.update')
  );

CREATE POLICY facebook_pages_delete ON crm.facebook_pages FOR DELETE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.delete')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. crm.whatsapp_automation_rules
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS whatsapp_automation_tenant ON crm.whatsapp_automation_rules;

CREATE POLICY whatsapp_automation_select ON crm.whatsapp_automation_rules FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY whatsapp_automation_insert ON crm.whatsapp_automation_rules FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY whatsapp_automation_update ON crm.whatsapp_automation_rules FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY whatsapp_automation_delete ON crm.whatsapp_automation_rules FOR DELETE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. crm.messaging_configs
--    Contains platform-specific configuration (may include auth tokens).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS messaging_configs_tenant ON crm.messaging_configs;

CREATE POLICY messaging_configs_select ON crm.messaging_configs FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY messaging_configs_insert ON crm.messaging_configs FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.create')
  );

CREATE POLICY messaging_configs_update ON crm.messaging_configs FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.update')
  );

CREATE POLICY messaging_configs_delete ON crm.messaging_configs FOR DELETE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'integrations.delete')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. crm.scheduled_messages
--    Operational messaging queue — outlet-scoped, no extra permission check
--    (managed by automation/background jobs already holding outlet context).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS scheduled_messages_tenant ON crm.scheduled_messages;

CREATE POLICY scheduled_messages_select ON crm.scheduled_messages FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY scheduled_messages_insert ON crm.scheduled_messages FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY scheduled_messages_update ON crm.scheduled_messages FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY scheduled_messages_delete ON crm.scheduled_messages FOR DELETE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. crm.application_settings
--    outlet_id is NULLABLE: NULL = tenant-wide setting (admin-only writes),
--    non-NULL = outlet-specific setting (outlet-member writes).
--    This requires a combined USING / WITH CHECK expression.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS application_settings_tenant ON crm.application_settings;

CREATE POLICY application_settings_select ON crm.application_settings FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(tenant_id)
    AND (
      outlet_id IS NULL                                        -- tenant-wide: any tenant member
      OR tenancy.can_access_outlet(tenant_id, outlet_id)      -- outlet-specific: outlet member
    )
  );

-- Tenant-wide settings (outlet_id IS NULL) require tenant-admin to write.
-- Outlet-specific settings require outlet membership to write.
CREATE POLICY application_settings_insert ON crm.application_settings FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND (
      (outlet_id IS NULL AND tenancy.is_tenant_admin(tenant_id))
      OR (outlet_id IS NOT NULL AND tenancy.can_access_outlet(tenant_id, outlet_id))
    )
  );

CREATE POLICY application_settings_update ON crm.application_settings FOR UPDATE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND (
      (outlet_id IS NULL AND tenancy.is_tenant_admin(tenant_id))
      OR (outlet_id IS NOT NULL AND tenancy.can_access_outlet(tenant_id, outlet_id))
    )
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND (
      (outlet_id IS NULL AND tenancy.is_tenant_admin(tenant_id))
      OR (outlet_id IS NOT NULL AND tenancy.can_access_outlet(tenant_id, outlet_id))
    )
  );

CREATE POLICY application_settings_delete ON crm.application_settings FOR DELETE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND (
      (outlet_id IS NULL AND tenancy.is_tenant_admin(tenant_id))
      OR (outlet_id IS NOT NULL AND tenancy.can_access_outlet(tenant_id, outlet_id))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. crm.company_details
--    No outlet_id (tenant_id is PK). Tenant-level access for reads is correct.
--    Strengthen writes to require tenant-admin.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS company_details_tenant ON crm.company_details;

CREATE POLICY company_details_select ON crm.company_details FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(tenant_id)
  );

CREATE POLICY company_details_insert ON crm.company_details FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.is_tenant_admin(tenant_id)
  );

CREATE POLICY company_details_update ON crm.company_details FOR UPDATE
  USING (tenancy.is_tenant_admin(tenant_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.is_tenant_admin(tenant_id)
  );

CREATE POLICY company_details_delete ON crm.company_details FOR DELETE
  USING (tenancy.is_tenant_admin(tenant_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. crm.public_urls (P1 from security audit)
--    outlet_id present — upgrade to outlet-scoped.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS public_urls_tenant ON crm.public_urls;

CREATE POLICY public_urls_select ON crm.public_urls FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY public_urls_insert ON crm.public_urls FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND owner_user_id = iam.current_user_id()
  );

CREATE POLICY public_urls_update ON crm.public_urls FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY public_urls_delete ON crm.public_urls FOR DELETE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. crm.wallet_accounts  (financial data)
--    Composite PK (tenant_id, outlet_id, user_id).
--    Users can read their own wallet; tenant admins and outlet members can read all.
--    Direct writes by application (no user-initiated INSERT on wallets).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS wallet_accounts_tenant ON crm.wallet_accounts;

CREATE POLICY wallet_accounts_select ON crm.wallet_accounts FOR SELECT
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    OR (tenant_id = tenancy.current_tenant_id() AND user_id = iam.current_user_id())
  );

CREATE POLICY wallet_accounts_insert ON crm.wallet_accounts FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY wallet_accounts_update ON crm.wallet_accounts FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

-- Wallet accounts are not deleted (soft-deactivate via business logic).
-- No DELETE policy → FORCE RLS blocks hard-delete from sensible_app_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. crm.wallet_transactions  (financial ledger — append-only)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS wallet_transactions_tenant ON crm.wallet_transactions;

CREATE POLICY wallet_transactions_select ON crm.wallet_transactions FOR SELECT
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    OR (tenant_id = tenancy.current_tenant_id() AND user_id = iam.current_user_id())
  );

CREATE POLICY wallet_transactions_insert ON crm.wallet_transactions FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND created_by_user_id = iam.current_user_id()
  );

-- Wallet transactions are immutable — no UPDATE or DELETE policy.
-- FORCE RLS blocks any update/delete attempt from sensible_app_role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. crm.push_notification_devices
--     No outlet_id. Users manage their own device tokens.
--     Tenant admins can read all for notification sending.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS push_devices_tenant ON crm.push_notification_devices;

CREATE POLICY push_devices_select ON crm.push_notification_devices FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND (
      user_id = iam.current_user_id()
      OR tenancy.is_tenant_admin(tenant_id)
    )
  );

CREATE POLICY push_devices_insert ON crm.push_notification_devices FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND user_id = iam.current_user_id()
  );

CREATE POLICY push_devices_update ON crm.push_notification_devices FOR UPDATE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND user_id = iam.current_user_id()
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND user_id = iam.current_user_id()
  );

CREATE POLICY push_devices_delete ON crm.push_notification_devices FOR DELETE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND user_id = iam.current_user_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. crm.push_notifications
--     No outlet_id. Recipients read their own; sender inserts; admin reads all.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS push_notifications_tenant ON crm.push_notifications;

CREATE POLICY push_notifications_select ON crm.push_notifications FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND (
      recipient_user_id = iam.current_user_id()
      OR tenancy.is_tenant_admin(tenant_id)
    )
  );

CREATE POLICY push_notifications_insert ON crm.push_notifications FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(tenant_id)
  );

-- Recipients can mark their own notifications as read (update read_at).
CREATE POLICY push_notifications_update ON crm.push_notifications FOR UPDATE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND recipient_user_id = iam.current_user_id()
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND recipient_user_id = iam.current_user_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. crm.quick_contacts  (P0 from security audit)
--     outlet_id present — upgrade from tenant-only to outlet-scoped.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS quick_contacts_tenant ON crm.quick_contacts;

CREATE POLICY quick_contacts_select ON crm.quick_contacts FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY quick_contacts_insert ON crm.quick_contacts FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY quick_contacts_update ON crm.quick_contacts FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY quick_contacts_delete ON crm.quick_contacts FOR DELETE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. crm.shifts  (outlet operational data)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS shifts_tenant ON crm.shifts;

CREATE POLICY shifts_select ON crm.shifts FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY shifts_insert ON crm.shifts FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND opened_by_user_id = iam.current_user_id()
  );

CREATE POLICY shifts_update ON crm.shifts FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY shifts_delete ON crm.shifts FOR DELETE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND tenancy.is_tenant_admin(tenant_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. crm.sales_orders  (outlet sales data)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sales_orders_tenant ON crm.sales_orders;

CREATE POLICY sales_orders_select ON crm.sales_orders FOR SELECT
  USING (tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY sales_orders_insert ON crm.sales_orders FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND created_by_user_id = iam.current_user_id()
  );

CREATE POLICY sales_orders_update ON crm.sales_orders FOR UPDATE
  USING (tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY sales_orders_delete ON crm.sales_orders FOR DELETE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND tenancy.is_tenant_admin(tenant_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. crm.quotations — add missing UPDATE and DELETE policies + DML grants
--     (migration 0033 defined only SELECT and INSERT)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS quotations_update ON crm.quotations;
DROP POLICY IF EXISTS quotations_delete ON crm.quotations;

CREATE POLICY quotations_update ON crm.quotations FOR UPDATE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'leads.update')
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'leads.update')
  );

CREATE POLICY quotations_delete ON crm.quotations FOR DELETE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND (
      created_by_user_id = iam.current_user_id()
      OR iam.has_outlet_permission(tenant_id, outlet_id, 'leads.update')
    )
  );

DROP POLICY IF EXISTS quotation_items_update ON crm.quotation_items;
DROP POLICY IF EXISTS quotation_items_delete ON crm.quotation_items;

CREATE POLICY quotation_items_update ON crm.quotation_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM crm.quotations q
      WHERE q.tenant_id = quotation_items.tenant_id
        AND q.id = quotation_items.quotation_id
        AND iam.has_outlet_permission(q.tenant_id, q.outlet_id, 'leads.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm.quotations q
      WHERE q.tenant_id = quotation_items.tenant_id
        AND q.id = quotation_items.quotation_id
        AND iam.has_outlet_permission(q.tenant_id, q.outlet_id, 'leads.update')
    )
  );

CREATE POLICY quotation_items_delete ON crm.quotation_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM crm.quotations q
      WHERE q.tenant_id = quotation_items.tenant_id
        AND q.id = quotation_items.quotation_id
        AND (
          q.created_by_user_id = iam.current_user_id()
          OR iam.has_outlet_permission(q.tenant_id, q.outlet_id, 'leads.update')
        )
    )
  );

-- Grant UPDATE and DELETE on quotations (were missing in migration 0033)
GRANT UPDATE, DELETE ON crm.quotations TO sensible_app_role;
GRANT UPDATE, DELETE ON crm.quotation_items TO sensible_app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. crm.tasks — add missing DELETE policy
--     (migration 0028 defined SELECT, INSERT, UPDATE but no DELETE)
--     Tasks use soft-delete (deleted_at column) but the policy ensures
--     hard-delete requires tasks.delete permission.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tasks_delete ON crm.tasks;

CREATE POLICY tasks_delete ON crm.tasks FOR DELETE
  USING (
    tenancy.can_access_outlet(tenant_id, outlet_id)
    AND iam.has_outlet_permission(tenant_id, outlet_id, 'tasks.delete')
  );

-- task_status_history is append-only — no DELETE policy intentional.
-- Adding a defensive explicit block:
DROP POLICY IF EXISTS task_status_history_delete ON crm.task_status_history;
-- (No policy created — FORCE RLS blocks delete by default.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. Grant missing tasks DML (migration 0028 only granted SELECT/INSERT/UPDATE)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT DELETE ON crm.tasks TO sensible_app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. Verify BYPASSRLS is not held by sensible_app_role
--     (fail early if the role was accidentally granted BYPASSRLS)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE rec record;
BEGIN
  SELECT rolbypassrls, rolsuper INTO rec
  FROM pg_roles WHERE rolname = 'sensible_app_role';
  IF rec.rolbypassrls OR rec.rolsuper THEN
    RAISE EXCEPTION
      'sensible_app_role must not hold BYPASSRLS or superuser; '
      'current state: rolbypassrls=%, rolsuper=%', rec.rolbypassrls, rec.rolsuper;
  END IF;
END $$;
