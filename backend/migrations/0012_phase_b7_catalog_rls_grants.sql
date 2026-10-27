-- SECURITY DEFINER RLS helpers execute as sensible_rls_owner. Grant that
-- owner read access to every catalog relation inspected by those helpers.
GRANT SELECT ON
  crm.product_categories,
  crm.products,
  crm.product_outlets,
  crm.warehouses,
  crm.warehouse_stock,
  crm.stock_ledger,
  crm.stock_adjustments,
  crm.stock_adjustment_items,
  crm.warehouse_transfers
TO sensible_rls_owner;
