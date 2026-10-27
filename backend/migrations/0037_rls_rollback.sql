-- =============================================================================
-- Rollback for Migration 0037: Restore tenant-equality-only RLS policies
--
-- This script reverts every policy change made by 0037. Run this BEFORE
-- re-running 0037 if you need to reapply it, or to undo the migration.
--
-- WARNING: Applying this rollback weakens outlet isolation back to tenant-only.
--          Do NOT apply to production without a planned maintenance window.
-- =============================================================================

SET TIME ZONE 'UTC';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1-2. crm.integrations / crm.facebook_pages
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS integrations_select ON crm.integrations;
DROP POLICY IF EXISTS integrations_insert ON crm.integrations;
DROP POLICY IF EXISTS integrations_update ON crm.integrations;
DROP POLICY IF EXISTS integrations_delete ON crm.integrations;
CREATE POLICY integrations_tenant ON crm.integrations
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

DROP POLICY IF EXISTS facebook_pages_select ON crm.facebook_pages;
DROP POLICY IF EXISTS facebook_pages_insert ON crm.facebook_pages;
DROP POLICY IF EXISTS facebook_pages_update ON crm.facebook_pages;
DROP POLICY IF EXISTS facebook_pages_delete ON crm.facebook_pages;
CREATE POLICY facebook_pages_tenant ON crm.facebook_pages
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. crm.whatsapp_automation_rules
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS whatsapp_automation_select ON crm.whatsapp_automation_rules;
DROP POLICY IF EXISTS whatsapp_automation_insert ON crm.whatsapp_automation_rules;
DROP POLICY IF EXISTS whatsapp_automation_update ON crm.whatsapp_automation_rules;
DROP POLICY IF EXISTS whatsapp_automation_delete ON crm.whatsapp_automation_rules;
CREATE POLICY whatsapp_automation_tenant ON crm.whatsapp_automation_rules
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. crm.messaging_configs
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS messaging_configs_select ON crm.messaging_configs;
DROP POLICY IF EXISTS messaging_configs_insert ON crm.messaging_configs;
DROP POLICY IF EXISTS messaging_configs_update ON crm.messaging_configs;
DROP POLICY IF EXISTS messaging_configs_delete ON crm.messaging_configs;
CREATE POLICY messaging_configs_tenant ON crm.messaging_configs
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. crm.scheduled_messages
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS scheduled_messages_select ON crm.scheduled_messages;
DROP POLICY IF EXISTS scheduled_messages_insert ON crm.scheduled_messages;
DROP POLICY IF EXISTS scheduled_messages_update ON crm.scheduled_messages;
DROP POLICY IF EXISTS scheduled_messages_delete ON crm.scheduled_messages;
CREATE POLICY scheduled_messages_tenant ON crm.scheduled_messages
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. crm.application_settings
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS application_settings_select ON crm.application_settings;
DROP POLICY IF EXISTS application_settings_insert ON crm.application_settings;
DROP POLICY IF EXISTS application_settings_update ON crm.application_settings;
DROP POLICY IF EXISTS application_settings_delete ON crm.application_settings;
CREATE POLICY application_settings_tenant ON crm.application_settings
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. crm.company_details
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS company_details_select ON crm.company_details;
DROP POLICY IF EXISTS company_details_insert ON crm.company_details;
DROP POLICY IF EXISTS company_details_update ON crm.company_details;
DROP POLICY IF EXISTS company_details_delete ON crm.company_details;
CREATE POLICY company_details_tenant ON crm.company_details
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. crm.public_urls
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS public_urls_select ON crm.public_urls;
DROP POLICY IF EXISTS public_urls_insert ON crm.public_urls;
DROP POLICY IF EXISTS public_urls_update ON crm.public_urls;
DROP POLICY IF EXISTS public_urls_delete ON crm.public_urls;
CREATE POLICY public_urls_tenant ON crm.public_urls
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. crm.wallet_accounts / 10. crm.wallet_transactions
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS wallet_accounts_select ON crm.wallet_accounts;
DROP POLICY IF EXISTS wallet_accounts_insert ON crm.wallet_accounts;
DROP POLICY IF EXISTS wallet_accounts_update ON crm.wallet_accounts;
CREATE POLICY wallet_accounts_tenant ON crm.wallet_accounts
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

DROP POLICY IF EXISTS wallet_transactions_select ON crm.wallet_transactions;
DROP POLICY IF EXISTS wallet_transactions_insert ON crm.wallet_transactions;
CREATE POLICY wallet_transactions_tenant ON crm.wallet_transactions
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. crm.push_notification_devices / 12. crm.push_notifications
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS push_devices_select ON crm.push_notification_devices;
DROP POLICY IF EXISTS push_devices_insert ON crm.push_notification_devices;
DROP POLICY IF EXISTS push_devices_update ON crm.push_notification_devices;
DROP POLICY IF EXISTS push_devices_delete ON crm.push_notification_devices;
CREATE POLICY push_devices_tenant ON crm.push_notification_devices
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

DROP POLICY IF EXISTS push_notifications_select ON crm.push_notifications;
DROP POLICY IF EXISTS push_notifications_insert ON crm.push_notifications;
DROP POLICY IF EXISTS push_notifications_update ON crm.push_notifications;
CREATE POLICY push_notifications_tenant ON crm.push_notifications
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. crm.quick_contacts / 14. crm.shifts / 15. crm.sales_orders
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS quick_contacts_select ON crm.quick_contacts;
DROP POLICY IF EXISTS quick_contacts_insert ON crm.quick_contacts;
DROP POLICY IF EXISTS quick_contacts_update ON crm.quick_contacts;
DROP POLICY IF EXISTS quick_contacts_delete ON crm.quick_contacts;
CREATE POLICY quick_contacts_tenant ON crm.quick_contacts
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

DROP POLICY IF EXISTS shifts_select ON crm.shifts;
DROP POLICY IF EXISTS shifts_insert ON crm.shifts;
DROP POLICY IF EXISTS shifts_update ON crm.shifts;
DROP POLICY IF EXISTS shifts_delete ON crm.shifts;
CREATE POLICY shifts_tenant ON crm.shifts
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

DROP POLICY IF EXISTS sales_orders_select ON crm.sales_orders;
DROP POLICY IF EXISTS sales_orders_insert ON crm.sales_orders;
DROP POLICY IF EXISTS sales_orders_update ON crm.sales_orders;
DROP POLICY IF EXISTS sales_orders_delete ON crm.sales_orders;
CREATE POLICY sales_orders_tenant ON crm.sales_orders
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. crm.quotations / quotation_items — remove UPDATE/DELETE policies & grants
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS quotations_update ON crm.quotations;
DROP POLICY IF EXISTS quotations_delete ON crm.quotations;
DROP POLICY IF EXISTS quotation_items_update ON crm.quotation_items;
DROP POLICY IF EXISTS quotation_items_delete ON crm.quotation_items;
REVOKE UPDATE, DELETE ON crm.quotations FROM sensible_app_role;
REVOKE UPDATE, DELETE ON crm.quotation_items FROM sensible_app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17-18. crm.tasks — remove DELETE policy & revoke grant
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tasks_delete ON crm.tasks;
REVOKE DELETE ON crm.tasks FROM sensible_app_role;
