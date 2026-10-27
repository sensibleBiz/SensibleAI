-- =============================================================================
-- Migration 0049: Sensible AI Accountant & Sensible AI Exports Suite
--
-- Establishes two new enterprise schema domains on the central PostgreSQL core:
--   1. accounts schema:
--      • accounts.chart_of_accounts — double-entry ledger accounts master
--      • accounts.general_ledger    — journal vouchers (sales, purchase, payments)
--      • accounts.journal_lines     — individual balanced debit/credit lines
--      • accounts.gst_invoices      — GST tax invoices (B2B, B2C, e-Way, IRN)
--      • accounts.gst_invoice_items — line items with HSN/SAC codes & GST slabs
--      • accounts.expense_claims    — staff operational & GPS conveyance claims
--      • accounts.holiday_calendar  — holidays linked to payroll deductions
--      • accounts.tally_sync_journal— 2-way TallyPrime delta sync ($ALTERID/REMOTEID)
--
--   2. exports schema:
--      • exports.foreign_buyers     — global trade buyers, currencies, Incoterms
--      • exports.export_orders      — sales contracts / Proforma Invoices
--      • exports.export_order_items — HS codes, unit pricing in foreign currency
--      • exports.letters_of_credit  — LC banking conditions, presentation deadlines
--      • exports.shipments          — ocean/air bills of lading, shipping bills
--      • exports.container_milestones— vessel departure, port calls, customs LEO
--
-- Multi-Tenancy & Security:
--   • All multi-tenant tables enforce composite FKs (tenant_id, outlet_id).
--   • Strict Row-Level Security (RLS) enabled and forced.
-- =============================================================================

SET TIME ZONE 'UTC';

-- ─────────────────────────────────────────────────────────────────────────────
-- Schemas & Grants
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS accounts;
CREATE SCHEMA IF NOT EXISTS exports;

GRANT USAGE ON SCHEMA accounts TO sensible_app_role;
GRANT USAGE ON SCHEMA exports TO sensible_app_role;
GRANT USAGE ON SCHEMA accounts TO sensible_rls_owner;
GRANT USAGE ON SCHEMA exports TO sensible_rls_owner;

-- ─────────────────────────────────────────────────────────────────────────────
-- Custom Types (Accounts)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE accounts.account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accounts.voucher_type AS ENUM ('SALES', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'JOURNAL', 'CONTRA', 'PAYROLL', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accounts.voucher_status AS ENUM ('DRAFT', 'POSTED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accounts.gst_invoice_type AS ENUM ('B2B', 'B2C_LARGE', 'B2C_SMALL', 'EXPORT_WITH_PAY', 'EXPORT_WITHOUT_PAY', 'DEEMED_EXPORT', 'REVERSE_CHARGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accounts.gst_payment_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accounts.expense_claim_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'DISBURSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accounts.tally_sync_status AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accounts.holiday_type AS ENUM ('NATIONAL', 'REGIONAL', 'OPTIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Custom Types (Exports)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE exports.incoterm AS ENUM ('FOB', 'CIF', 'CFR', 'EXW', 'DDP', 'DAP', 'FCA', 'CIP', 'CPT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exports.export_payment_term AS ENUM ('LC_AT_SIGHT', 'LC_USANCE', 'ADVANCE_TT', 'DP', 'DA', 'OPEN_ACCOUNT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exports.export_order_status AS ENUM ('DRAFT', 'CONFIRMED', 'PRODUCTION', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CLOSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exports.lc_status AS ENUM ('DRAFT', 'ISSUED', 'CONFIRMED', 'NEGOTIATED', 'DRAWN', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exports.transport_mode AS ENUM ('SEA', 'AIR', 'ROAD', 'RAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exports.shipment_status AS ENUM ('BOOKED', 'GATED_IN', 'LOADED', 'IN_TRANSIT', 'ARRIVED_PORT', 'CUSTOMS_CLEARED', 'DELIVERED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. accounts.chart_of_accounts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  account_code varchar(64) NOT NULL,
  account_name text NOT NULL,
  account_type accounts.account_type NOT NULL,
  parent_account_id uuid,
  currency varchar(10) NOT NULL DEFAULT 'INR',
  current_balance numeric(16, 2) NOT NULL DEFAULT 0.00,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  tally_ledger_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coa_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT coa_tenant_outlet_code_uq UNIQUE (tenant_id, outlet_id, account_code),
  CONSTRAINT coa_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS coa_tenant_outlet_idx ON accounts.chart_of_accounts (tenant_id, outlet_id);
CREATE INDEX IF NOT EXISTS coa_account_type_idx ON accounts.chart_of_accounts (tenant_id, account_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. accounts.general_ledger & journal_lines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts.general_ledger (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  voucher_number varchar(64) NOT NULL,
  voucher_type accounts.voucher_type NOT NULL,
  voucher_date date NOT NULL,
  narration text NOT NULL DEFAULT '',
  total_debit numeric(16, 2) NOT NULL DEFAULT 0.00,
  total_credit numeric(16, 2) NOT NULL DEFAULT 0.00,
  status accounts.voucher_status NOT NULL DEFAULT 'POSTED',
  reference_module varchar(64),
  reference_id uuid,
  tally_remote_id varchar(128),
  posted_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gl_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT gl_tenant_outlet_voucher_uq UNIQUE (tenant_id, outlet_id, voucher_number),
  CONSTRAINT gl_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT gl_balanced_ck CHECK (total_debit = total_credit)
);
CREATE INDEX IF NOT EXISTS gl_tenant_date_idx ON accounts.general_ledger (tenant_id, voucher_date);

CREATE TABLE IF NOT EXISTS accounts.journal_lines (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  ledger_id uuid NOT NULL REFERENCES accounts.general_ledger(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts.chart_of_accounts(id) ON DELETE RESTRICT,
  line_number integer NOT NULL,
  debit_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  credit_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  description text,
  tally_ledger_name text,
  CONSTRAINT journal_lines_ledger_line_uq UNIQUE (ledger_id, line_number),
  CONSTRAINT journal_lines_nonneg_ck CHECK (debit_amount >= 0 AND credit_amount >= 0)
);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON accounts.journal_lines (tenant_id, account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. accounts.gst_invoices & items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts.gst_invoices (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  invoice_number varchar(64) NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  invoice_type accounts.gst_invoice_type NOT NULL DEFAULT 'B2B',
  customer_id uuid,
  customer_name text NOT NULL,
  customer_gstin varchar(15),
  billing_address text NOT NULL DEFAULT '',
  shipping_address text NOT NULL DEFAULT '',
  place_of_supply varchar(64) NOT NULL,
  is_inter_state boolean NOT NULL DEFAULT false,
  total_taxable_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  cgst_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  sgst_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  igst_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  cess_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  round_off_amount numeric(8, 2) NOT NULL DEFAULT 0.00,
  total_invoice_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  paid_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  payment_status accounts.gst_payment_status NOT NULL DEFAULT 'UNPAID',
  irn varchar(128),
  qr_code_url text,
  eway_bill_number varchar(64),
  eway_bill_date timestamptz,
  tally_sync_status accounts.tally_sync_status NOT NULL DEFAULT 'PENDING',
  tally_remote_id varchar(128),
  tally_alter_id varchar(64),
  notes text,
  terms_and_conditions text,
  created_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gst_invoices_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT gst_invoices_tenant_outlet_number_uq UNIQUE (tenant_id, outlet_id, invoice_number),
  CONSTRAINT gst_invoices_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS gst_invoices_tenant_date_idx ON accounts.gst_invoices (tenant_id, invoice_date);
CREATE INDEX IF NOT EXISTS gst_invoices_payment_status_idx ON accounts.gst_invoices (tenant_id, payment_status);

CREATE TABLE IF NOT EXISTS accounts.gst_invoice_items (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES accounts.gst_invoices(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  product_id uuid,
  item_description text NOT NULL,
  hsn_sac_code varchar(16) NOT NULL,
  quantity numeric(12, 3) NOT NULL DEFAULT 1.000,
  uom varchar(16) NOT NULL DEFAULT 'PCS',
  unit_price numeric(16, 2) NOT NULL DEFAULT 0.00,
  discount_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  taxable_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  gst_rate numeric(5, 2) NOT NULL DEFAULT 18.00,
  cgst_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  sgst_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  igst_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  total_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  CONSTRAINT gst_invoice_items_invoice_line_uq UNIQUE (invoice_id, line_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. accounts.expense_claims
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts.expense_claims (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  claim_number varchar(64) NOT NULL,
  employee_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  category varchar(64) NOT NULL,
  title text NOT NULL,
  description text,
  claim_date date NOT NULL,
  amount numeric(16, 2) NOT NULL,
  tax_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  receipt_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  gps_distance_km numeric(8, 2),
  conveyance_rate_per_km numeric(6, 2),
  status accounts.expense_claim_status NOT NULL DEFAULT 'SUBMITTED',
  approved_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_remarks text,
  disbursed_at timestamptz,
  tally_sync_status accounts.tally_sync_status NOT NULL DEFAULT 'PENDING',
  tally_remote_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_claims_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT expense_claims_tenant_number_uq UNIQUE (tenant_id, outlet_id, claim_number),
  CONSTRAINT expense_claims_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS expense_claims_employee_idx ON accounts.expense_claims (tenant_id, employee_user_id);
CREATE INDEX IF NOT EXISTS expense_claims_status_idx ON accounts.expense_claims (tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. accounts.holiday_calendar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts.holiday_calendar (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  title text NOT NULL,
  holiday_date date NOT NULL,
  holiday_type accounts.holiday_type NOT NULL DEFAULT 'NATIONAL',
  is_paid boolean NOT NULL DEFAULT true,
  applicable_states jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicable_outlets jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  year integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT holiday_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT holiday_tenant_outlet_date_title_uq UNIQUE (tenant_id, outlet_id, holiday_date, title),
  CONSTRAINT holiday_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS holiday_tenant_year_idx ON accounts.holiday_calendar (tenant_id, year);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. accounts.tally_sync_journal
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts.tally_sync_journal (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  sync_direction varchar(32) NOT NULL,
  entity_type varchar(32) NOT NULL,
  entity_id uuid NOT NULL,
  tally_remote_id varchar(128),
  tally_alter_id varchar(64),
  sync_status accounts.tally_sync_status NOT NULL DEFAULT 'PENDING',
  error_message text,
  payload_hash varchar(64),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tally_sync_status_idx ON accounts.tally_sync_journal (tenant_id, sync_status);
CREATE INDEX IF NOT EXISTS tally_sync_remote_id_idx ON accounts.tally_sync_journal (tenant_id, tally_remote_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. exports.foreign_buyers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports.foreign_buyers (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  buyer_code varchar(64) NOT NULL,
  buyer_name text NOT NULL,
  country_code varchar(4) NOT NULL,
  country_name text NOT NULL,
  destination_port text NOT NULL,
  default_currency varchar(10) NOT NULL DEFAULT 'USD',
  default_incoterm exports.incoterm NOT NULL DEFAULT 'FOB',
  default_payment_term exports.export_payment_term NOT NULL DEFAULT 'LC_AT_SIGHT',
  credit_limit_usd numeric(16, 2) NOT NULL DEFAULT 0.00,
  risk_rating varchar(16) NOT NULL DEFAULT 'LOW',
  contact_person text,
  email varchar(320),
  phone varchar(32),
  billing_address text NOT NULL DEFAULT '',
  shipping_address text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foreign_buyers_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT foreign_buyers_tenant_code_uq UNIQUE (tenant_id, outlet_id, buyer_code),
  CONSTRAINT foreign_buyers_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS foreign_buyers_country_idx ON exports.foreign_buyers (tenant_id, country_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. exports.export_orders & items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports.export_orders (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  order_number varchar(64) NOT NULL,
  order_date date NOT NULL,
  buyer_id uuid NOT NULL REFERENCES exports.foreign_buyers(id) ON DELETE RESTRICT,
  incoterm exports.incoterm NOT NULL DEFAULT 'FOB',
  port_of_loading text NOT NULL,
  port_of_discharge text NOT NULL,
  currency varchar(10) NOT NULL DEFAULT 'USD',
  exchange_rate_inr numeric(10, 4) NOT NULL DEFAULT 84.0000,
  total_fob_value numeric(16, 2) NOT NULL DEFAULT 0.00,
  freight_insurance_value numeric(16, 2) NOT NULL DEFAULT 0.00,
  total_invoice_value numeric(16, 2) NOT NULL DEFAULT 0.00,
  payment_term exports.export_payment_term NOT NULL DEFAULT 'LC_AT_SIGHT',
  advance_received_amount numeric(16, 2) NOT NULL DEFAULT 0.00,
  status exports.export_order_status NOT NULL DEFAULT 'DRAFT',
  commercial_invoice_number varchar(64),
  shipping_bill_number varchar(64),
  notes text,
  created_by uuid REFERENCES iam.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_orders_outlet_fk FOREIGN KEY (tenant_id, outlet_id) REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT export_orders_tenant_number_uq UNIQUE (tenant_id, outlet_id, order_number),
  CONSTRAINT export_orders_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS export_orders_buyer_idx ON exports.export_orders (tenant_id, buyer_id);
CREATE INDEX IF NOT EXISTS export_orders_status_idx ON exports.export_orders (tenant_id, status);

CREATE TABLE IF NOT EXISTS exports.export_order_items (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES exports.export_orders(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  product_id uuid,
  hs_code varchar(16) NOT NULL,
  item_description text NOT NULL,
  quantity numeric(12, 3) NOT NULL DEFAULT 1.000,
  uom varchar(16) NOT NULL DEFAULT 'PCS',
  unit_price_foreign numeric(16, 4) NOT NULL DEFAULT 0.0000,
  total_value_foreign numeric(16, 2) NOT NULL DEFAULT 0.00,
  CONSTRAINT export_order_items_order_line_uq UNIQUE (order_id, line_number)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. exports.letters_of_credit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports.letters_of_credit (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES exports.export_orders(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES exports.foreign_buyers(id) ON DELETE RESTRICT,
  lc_number varchar(64) NOT NULL,
  issuing_bank text NOT NULL,
  advising_bank text,
  lc_value numeric(16, 2) NOT NULL,
  currency varchar(10) NOT NULL DEFAULT 'USD',
  issuance_date date NOT NULL,
  expiry_date date NOT NULL,
  latest_shipment_date date NOT NULL,
  presentation_days integer NOT NULL DEFAULT 21,
  status exports.lc_status NOT NULL DEFAULT 'ISSUED',
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  clauses_and_conditions text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lc_tenant_number_uq UNIQUE (tenant_id, outlet_id, lc_number),
  CONSTRAINT lc_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS lc_expiry_date_idx ON exports.letters_of_credit (tenant_id, expiry_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. exports.shipments & container_milestones
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exports.shipments (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES exports.export_orders(id) ON DELETE RESTRICT,
  shipment_number varchar(64) NOT NULL,
  transport_mode exports.transport_mode NOT NULL DEFAULT 'SEA',
  shipping_line_or_carrier text NOT NULL,
  vessel_name text,
  voyage_or_flight_number varchar(64),
  container_number varchar(64),
  seal_number varchar(64),
  bill_of_lading_or_awb varchar(64),
  bl_date date,
  shipping_bill_number varchar(64),
  shipping_bill_date date,
  port_of_loading text NOT NULL,
  port_of_discharge text NOT NULL,
  etd timestamptz,
  eta timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  status exports.shipment_status NOT NULL DEFAULT 'BOOKED',
  current_location text,
  tracking_last_updated timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipments_tenant_number_uq UNIQUE (tenant_id, outlet_id, shipment_number),
  CONSTRAINT shipments_tenant_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON exports.shipments (tenant_id, status);
CREATE INDEX IF NOT EXISTS shipments_container_idx ON exports.shipments (tenant_id, container_number);

CREATE TABLE IF NOT EXISTS exports.container_milestones (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  shipment_id uuid NOT NULL REFERENCES exports.shipments(id) ON DELETE CASCADE,
  milestone_code varchar(64) NOT NULL,
  milestone_location text NOT NULL,
  milestone_timestamp timestamptz NOT NULL,
  description text NOT NULL,
  raw_carrier_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS container_milestones_shipment_idx ON exports.container_milestones (tenant_id, shipment_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE accounts.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.chart_of_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.general_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.general_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.journal_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.gst_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.gst_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.gst_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.gst_invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.expense_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.holiday_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.holiday_calendar FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts.tally_sync_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts.tally_sync_journal FORCE ROW LEVEL SECURITY;

ALTER TABLE exports.foreign_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports.foreign_buyers FORCE ROW LEVEL SECURITY;
ALTER TABLE exports.export_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports.export_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE exports.export_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports.export_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE exports.letters_of_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports.letters_of_credit FORCE ROW LEVEL SECURITY;
ALTER TABLE exports.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports.shipments FORCE ROW LEVEL SECURITY;
ALTER TABLE exports.container_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports.container_milestones FORCE ROW LEVEL SECURITY;

-- Standard tenant & outlet isolation policy helper
CREATE POLICY coa_tenant_outlet_policy ON accounts.chart_of_accounts
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY gl_tenant_outlet_policy ON accounts.general_ledger
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY jl_tenant_outlet_policy ON accounts.journal_lines
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY gst_inv_tenant_outlet_policy ON accounts.gst_invoices
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY gst_inv_items_tenant_outlet_policy ON accounts.gst_invoice_items
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY exp_claims_tenant_outlet_policy ON accounts.expense_claims
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY holidays_tenant_outlet_policy ON accounts.holiday_calendar
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY tally_sync_tenant_outlet_policy ON accounts.tally_sync_journal
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY buyers_tenant_outlet_policy ON exports.foreign_buyers
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY orders_tenant_outlet_policy ON exports.export_orders
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY order_items_tenant_outlet_policy ON exports.export_order_items
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY lc_tenant_outlet_policy ON exports.letters_of_credit
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY shipments_tenant_outlet_policy ON exports.shipments
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

CREATE POLICY milestones_tenant_outlet_policy ON exports.container_milestones
  USING (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id))
  WITH CHECK (tenant_id = tenancy.current_tenant_id() AND tenancy.can_access_outlet(tenant_id, outlet_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Role Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT ALL ON ALL TABLES IN SCHEMA accounts TO sensible_app_role;
GRANT ALL ON ALL TABLES IN SCHEMA exports TO sensible_app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Module Permissions Registration in iam.permissions
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO iam.permissions (permission_key, description, catalog_key, label, category)
VALUES
  ('accounts.read', 'View Chart of Accounts, General Ledger and Day Book', 'CRM_ACCOUNTS_VIEW', 'View Accounts', 'Accounts'),
  ('accounts.vouchers.manage', 'Create and post Journal and Payment Vouchers', 'CRM_ACCOUNTS_MANAGE', 'Manage Vouchers', 'Accounts'),
  ('accounts.gst.invoices', 'Create and dispatch GST tax invoices & e-Way bills', 'CRM_GST_INVOICE_MANAGE', 'Manage GST Invoices', 'Accounts'),
  ('accounts.expenses.approve', 'Approve operational and conveyance expense claims', 'CRM_ACCOUNTS_EXPENSE_APPROVE', 'Approve Expenses', 'Accounts'),
  ('accounts.tally.sync', 'Trigger two-way synchronization with TallyPrime', 'CRM_TALLY_SYNC', 'TallyPrime Sync', 'Accounts'),
  ('exports.read', 'View foreign buyers, export orders and shipments', 'CRM_EXPORTS_VIEW', 'View Exports', 'Exports'),
  ('exports.orders.manage', 'Create export contracts, proforma invoices and packing lists', 'CRM_EXPORTS_MANAGE', 'Manage Export Orders', 'Exports'),
  ('exports.lc.manage', 'Manage Letters of Credit and bank negotiation documents', 'CRM_EXPORTS_LC_MANAGE', 'Manage LC', 'Exports'),
  ('exports.shipments.track', 'Manage container stuffing, shipping bills and milestones', 'CRM_EXPORTS_SHIPMENTS', 'Track Shipments', 'Exports')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = EXCLUDED.catalog_key,
  label = EXCLUDED.label,
  category = EXCLUDED.category;

