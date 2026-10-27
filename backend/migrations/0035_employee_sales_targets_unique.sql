-- Add business-key uniqueness constraints to crm.employee_sales_targets.
--
-- The table previously had only a UUID primary key, allowing concurrent INSERT
-- calls for the same employee+zone+month+year to create duplicate rows.
-- Two partial unique indexes cover the two row categories:
--
--   1. Real employees: identified by sale_executive_user_id (non-null)
--   2. Special aggregate entries: no user ID (e.g. "Sale from HO", "New Dealer")
--
-- PostgreSQL allows ON CONFLICT to target a partial unique index by listing the
-- same columns and WHERE clause used in the index definition.

CREATE UNIQUE INDEX IF NOT EXISTS employee_sales_targets_user_uq
  ON crm.employee_sales_targets (
    tenant_id, outlet_id, sale_executive_user_id, zone, target_month, target_year
  )
  WHERE sale_executive_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employee_sales_targets_special_uq
  ON crm.employee_sales_targets (
    tenant_id, outlet_id, zone, lower(sale_executive), target_month, target_year
  )
  WHERE sale_executive_user_id IS NULL;
