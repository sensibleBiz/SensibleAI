-- =============================================================================
-- Migration 0044: Credit billing schema
--
-- Creates the `billing` PostgreSQL schema with five tables:
--   billing.wallets          — one credit wallet per outlet
--   billing.wallet_transactions — immutable credit ledger (append-only)
--   billing.rate_cards       — platform-wide service pricing (read-only for app)
--   billing.usage_events     — per-call metering before and after credit deduction
--   billing.top_up_orders    — payment intents for credit purchases (PhonePe PG)
--
-- Design notes:
--   • All monetary / credit amounts use NUMERIC (never float).
--   • balance_credits is the total credits including reservations.
--     Available credits = balance_credits − reserved_credits.
--     Any debit must satisfy: amount ≤ (balance_credits − reserved_credits).
--   • wallet_transactions is append-only: no UPDATE or DELETE policy is
--     created; FORCE ROW LEVEL SECURITY blocks those operations from
--     sensible_app_role. Compensating entries use txn_type = 'REVERSAL'.
--   • rate_cards are managed via migration scripts only (no INSERT/UPDATE/
--     DELETE policy). sensible_app_role has SELECT only.
--   • PhonePe PG webhook authorization: the callback handler resolves the
--     tenant from top_up_orders.order_ref using the admin connection
--     (DATABASE_ADMIN_URL), then switches to withDatabaseContext with the
--     correct tenant_id before executing the status UPDATE. This preserves
--     tenant isolation without a SECURITY DEFINER bypass.
--
-- Rollback: see 0044_billing_rollback.sql
-- =============================================================================

SET TIME ZONE 'UTC';

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS billing;
GRANT USAGE ON SCHEMA billing TO sensible_app_role;
-- Table/FK checks execute with the table-owner role. Keep schema lookup
-- available to the non-login owner after table ownership is transferred below.
GRANT USAGE ON SCHEMA billing TO sensible_rls_owner;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. billing.wallets
--    One row per outlet. The single source of truth for credit balance.
--    balance_credits: total credits held (including reservations).
--    reserved_credits: credits locked for in-flight operations.
--    Available credits = balance_credits − reserved_credits.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE billing.wallets (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  outlet_id uuid NOT NULL,
  balance_credits NUMERIC(16,4) NOT NULL DEFAULT 0,
  reserved_credits NUMERIC(16,4) NOT NULL DEFAULT 0,
  currency varchar(10) NOT NULL DEFAULT 'INR',
  low_balance_threshold NUMERIC(16,4) NOT NULL DEFAULT 50000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallets_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT wallets_tenant_outlet_uq UNIQUE (tenant_id, outlet_id),
  CONSTRAINT wallets_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT wallets_balance_nonneg_ck CHECK (balance_credits >= 0),
  CONSTRAINT wallets_reserved_nonneg_ck CHECK (reserved_credits >= 0),
  CONSTRAINT wallets_reserved_lte_balance_ck CHECK (reserved_credits <= balance_credits),
  CONSTRAINT wallets_low_balance_nonneg_ck CHECK (low_balance_threshold >= 0),
  CONSTRAINT wallets_currency_ck CHECK (currency IN ('INR', 'USD', 'EUR'))
);

CREATE INDEX wallets_tenant_idx ON billing.wallets (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. billing.wallet_transactions
--    Immutable credit ledger. Every balance change produces one row.
--    txn_type values:
--      CREDIT   — credits added (top-up or manual grant)
--      DEBIT    — credits spent on a service
--      RESERVE  — credits locked for an in-flight operation
--      RELEASE  — reservation partially or fully released
--      REVERSAL — compensating entry referencing a prior transaction
--    balance_after and reserved_after are snapshots of billing.wallets at
--    the moment the transaction was committed, stored for audit.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE billing.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  txn_type varchar(16) NOT NULL,
  credits NUMERIC(16,4) NOT NULL,
  balance_after NUMERIC(16,4) NOT NULL,
  reserved_after NUMERIC(16,4) NOT NULL,
  reference_type varchar(32),
  reference_id uuid,
  idempotency_key varchar(128) NOT NULL,
  actor_user_id uuid REFERENCES iam.users(id) ON DELETE RESTRICT,
  description varchar(500),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_txns_wallet_tenant_fk FOREIGN KEY (tenant_id, wallet_id)
    REFERENCES billing.wallets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT wallet_txns_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT wallet_txns_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT wallet_txns_idempotency_uq UNIQUE (wallet_id, idempotency_key),
  CONSTRAINT wallet_txns_type_ck CHECK (txn_type IN (
    'CREDIT', 'DEBIT', 'RESERVE', 'RELEASE', 'REVERSAL'
  )),
  CONSTRAINT wallet_txns_credits_positive_ck CHECK (credits > 0),
  CONSTRAINT wallet_txns_balance_nonneg_ck CHECK (balance_after >= 0),
  CONSTRAINT wallet_txns_reserved_nonneg_ck CHECK (reserved_after >= 0),
  CONSTRAINT wallet_txns_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT wallet_txns_ref_coherence_ck CHECK (
    (reference_type IS NULL AND reference_id IS NULL)
    OR (reference_type IS NOT NULL AND reference_id IS NOT NULL)
  )
);

CREATE INDEX wallet_txns_wallet_created_idx
  ON billing.wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX wallet_txns_tenant_outlet_created_idx
  ON billing.wallet_transactions (tenant_id, outlet_id, created_at DESC);
CREATE INDEX wallet_txns_reference_idx
  ON billing.wallet_transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. billing.rate_cards
--    Platform-wide service pricing. Not tenant-scoped.
--    Managed exclusively via migration scripts (no app-role write access).
--    service_type examples:
--      'whatsapp.template', 'whatsapp.utility', 'whatsapp.authentication',
--      'whatsapp.service', 'email.ses', 'sms.transactional',
--      'ai.chat_token', 'ai.embedding', 'ai.agent_action'
--    The partial unique index ensures only one active rate card per
--    (service_type, country_code, provider) combination at any time.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE billing.rate_cards (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  service_type varchar(64) NOT NULL,
  country_code varchar(8),
  provider varchar(64),
  unit_label varchar(32) NOT NULL,
  credits_per_unit NUMERIC(10,4) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_cards_credits_positive_ck CHECK (credits_per_unit > 0),
  CONSTRAINT rate_cards_dates_ck CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT rate_cards_service_type_nonempty_ck CHECK (
    length(btrim(service_type)) > 0
  ),
  CONSTRAINT rate_cards_unit_nonempty_ck CHECK (length(btrim(unit_label)) > 0)
);

-- One active rate card per (service_type, country_code, provider) at a time.
-- NULLs are coalesced so (NULL, NULL) for global default is also unique.
CREATE UNIQUE INDEX rate_cards_active_service_uq
  ON billing.rate_cards (
    service_type,
    COALESCE(country_code, ''),
    COALESCE(provider, '')
  )
  WHERE is_active AND effective_until IS NULL;

CREATE INDEX rate_cards_service_lookup_idx
  ON billing.rate_cards (service_type, is_active, effective_from DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. billing.usage_events
--    One row per billable API call. Written before deduction attempt so
--    the event is always auditable even when billing fails.
--    status lifecycle: PENDING → BILLED | INSUFFICIENT | FAILED | REVERSED
--    billing_coherence_ck enforces that a BILLED event always carries both
--    billed_credits and a reference to the ledger entry.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE billing.usage_events (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  service_type varchar(64) NOT NULL,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit_label varchar(32) NOT NULL,
  rate_card_id uuid REFERENCES billing.rate_cards(id) ON DELETE RESTRICT,
  estimated_credits NUMERIC(14,4),
  billed_credits NUMERIC(14,4),
  status varchar(16) NOT NULL DEFAULT 'PENDING',
  wallet_txn_id uuid,
  reference_type varchar(32),
  reference_id uuid,
  idempotency_key varchar(128) NOT NULL,
  actor_user_id uuid REFERENCES iam.users(id) ON DELETE RESTRICT,
  provider_ref varchar(255),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_events_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT usage_events_wallet_tenant_fk FOREIGN KEY (tenant_id, wallet_id)
    REFERENCES billing.wallets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT usage_events_wallet_txn_fk FOREIGN KEY (tenant_id, wallet_txn_id)
    REFERENCES billing.wallet_transactions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT usage_events_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT usage_events_idempotency_uq UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT usage_events_quantity_ck CHECK (quantity > 0),
  CONSTRAINT usage_events_status_ck CHECK (status IN (
    'PENDING', 'BILLED', 'INSUFFICIENT', 'FAILED', 'REVERSED'
  )),
  CONSTRAINT usage_events_billed_nonneg_ck CHECK (
    billed_credits IS NULL OR billed_credits >= 0
  ),
  CONSTRAINT usage_events_billing_coherence_ck CHECK (
    (status = 'BILLED' AND billed_credits IS NOT NULL AND wallet_txn_id IS NOT NULL)
    OR (status <> 'BILLED' AND wallet_txn_id IS NULL)
  ),
  CONSTRAINT usage_events_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT usage_events_ref_coherence_ck CHECK (
    (reference_type IS NULL AND reference_id IS NULL)
    OR (reference_type IS NOT NULL AND reference_id IS NOT NULL)
  )
);

CREATE INDEX usage_events_wallet_status_idx
  ON billing.usage_events (wallet_id, status, created_at DESC);
CREATE INDEX usage_events_tenant_outlet_created_idx
  ON billing.usage_events (tenant_id, outlet_id, created_at DESC);
CREATE INDEX usage_events_reference_idx
  ON billing.usage_events (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. billing.top_up_orders
--    Payment intents for credit purchases. One row per top-up attempt.
--    A SUCCESS order atomically sets wallet_txn_id and paid_at.
--    A pending or failed order never holds wallet_txn_id (enforced by
--    top_up_success_coherence_ck).
--    provider_order_id uniqueness: partial unique index covers non-NULL values
--    only (multiple NULLs allowed while order awaits PhonePe response).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE billing.top_up_orders (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  order_ref varchar(128) NOT NULL,
  provider varchar(32) NOT NULL DEFAULT 'phonepe_pg',
  provider_order_id varchar(255),
  provider_txn_id varchar(255),
  amount_inr NUMERIC(12,2) NOT NULL,
  credits_to_grant NUMERIC(16,4) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'CREATED',
  callback_payload jsonb,
  idempotency_key varchar(128) NOT NULL,
  requested_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  expires_at timestamptz,
  paid_at timestamptz,
  wallet_txn_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT top_up_orders_outlet_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT top_up_orders_wallet_tenant_fk FOREIGN KEY (tenant_id, wallet_id)
    REFERENCES billing.wallets(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT top_up_orders_wallet_txn_fk FOREIGN KEY (tenant_id, wallet_txn_id)
    REFERENCES billing.wallet_transactions(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT top_up_orders_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT top_up_orders_order_ref_uq UNIQUE (order_ref),
  CONSTRAINT top_up_orders_idempotency_uq UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT top_up_amount_positive_ck CHECK (amount_inr > 0),
  CONSTRAINT top_up_credits_positive_ck CHECK (credits_to_grant > 0),
  CONSTRAINT top_up_status_ck CHECK (status IN (
    'CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'REFUNDED'
  )),
  CONSTRAINT top_up_provider_ck CHECK (
    provider IN ('phonepe_pg', 'manual', 'razorpay')
  ),
  CONSTRAINT top_up_success_coherence_ck CHECK (
    (status = 'SUCCESS' AND wallet_txn_id IS NOT NULL AND paid_at IS NOT NULL)
    OR (status <> 'SUCCESS' AND wallet_txn_id IS NULL)
  )
);

-- Unique non-null provider_order_id (NULL while awaiting PhonePe initiation)
CREATE UNIQUE INDEX top_up_orders_provider_order_uq
  ON billing.top_up_orders (provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE INDEX top_up_orders_wallet_status_idx
  ON billing.top_up_orders (wallet_id, status, created_at DESC);
CREATE INDEX top_up_orders_tenant_outlet_created_idx
  ON billing.top_up_orders (tenant_id, outlet_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table ownership
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE billing.wallets OWNER TO sensible_rls_owner;
ALTER TABLE billing.wallet_transactions OWNER TO sensible_rls_owner;
ALTER TABLE billing.rate_cards OWNER TO sensible_rls_owner;
ALTER TABLE billing.usage_events OWNER TO sensible_rls_owner;
ALTER TABLE billing.top_up_orders OWNER TO sensible_rls_owner;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE billing.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.wallets FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.wallet_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.rate_cards FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.usage_events FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.top_up_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.top_up_orders FORCE ROW LEVEL SECURITY;

-- billing.wallets policies
-- SELECT: outlet members and tenant admins can view their outlet's wallet.
CREATE POLICY wallets_select ON billing.wallets FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

-- INSERT: only tenant admins may create wallets (triggered at outlet creation).
CREATE POLICY wallets_insert ON billing.wallets FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.is_tenant_admin(tenant_id)
  );

-- UPDATE: outlet context required (service applies SELECT FOR UPDATE + UPDATE
-- atomically within withDatabaseContext; CHECK constraints enforce invariants).
CREATE POLICY wallets_update ON billing.wallets FOR UPDATE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );
-- No DELETE policy: wallets are financial records and must not be hard-deleted.
-- FORCE ROW LEVEL SECURITY blocks DELETE from sensible_app_role.

-- billing.wallet_transactions policies (append-only ledger)
CREATE POLICY wallet_txns_select ON billing.wallet_transactions FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY wallet_txns_insert ON billing.wallet_transactions FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );
-- No UPDATE or DELETE policy: ledger entries are immutable.
-- Compensating entries use txn_type = 'REVERSAL' referencing the original row.

-- billing.rate_cards policy (platform-wide, read-only for app role)
CREATE POLICY rate_cards_select ON billing.rate_cards FOR SELECT
  USING (true);
-- No INSERT, UPDATE, DELETE policies.
-- Rate cards are managed via migration scripts; sensible_app_role has SELECT only.

-- billing.usage_events policies
CREATE POLICY usage_events_select ON billing.usage_events FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

CREATE POLICY usage_events_insert ON billing.usage_events FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

-- UPDATE is needed to transition status PENDING → BILLED/INSUFFICIENT/FAILED.
CREATE POLICY usage_events_update ON billing.usage_events FOR UPDATE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );
-- No DELETE policy: usage events are retained for audit and billing reconciliation.

-- billing.top_up_orders policies
CREATE POLICY top_up_orders_select ON billing.top_up_orders FOR SELECT
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );

-- INSERT: the requesting user must match the session user.
CREATE POLICY top_up_orders_insert ON billing.top_up_orders FOR INSERT
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
    AND requested_by_user_id = iam.current_user_id()
  );

-- UPDATE: status transitions (including webhook callback) require outlet context.
-- Webhook handler resolves tenant from order_ref via DATABASE_ADMIN_URL before
-- entering withDatabaseContext (see Phase 6 implementation notes).
CREATE POLICY top_up_orders_update ON billing.top_up_orders FOR UPDATE
  USING (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  )
  WITH CHECK (
    tenant_id = tenancy.current_tenant_id()
    AND tenancy.can_access_outlet(tenant_id, outlet_id)
  );
-- No DELETE policy: order history must be retained for financial audit.

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON billing.wallets FROM PUBLIC;
REVOKE ALL ON billing.wallet_transactions FROM PUBLIC;
REVOKE ALL ON billing.rate_cards FROM PUBLIC;
REVOKE ALL ON billing.usage_events FROM PUBLIC;
REVOKE ALL ON billing.top_up_orders FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON billing.wallets TO sensible_app_role;
GRANT SELECT, INSERT ON billing.wallet_transactions TO sensible_app_role;
GRANT SELECT ON billing.rate_cards TO sensible_app_role;
GRANT SELECT, INSERT, UPDATE ON billing.usage_events TO sensible_app_role;
GRANT SELECT, INSERT, UPDATE ON billing.top_up_orders TO sensible_app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Billing permissions (for future RLS refinement in route-level checks)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO iam.permissions (
  permission_key, description, catalog_key, label, category
) VALUES
  ('billing.read',
   'View wallet balance, credit transactions, usage events, and top-up history',
   'CRM_BILLING_VIEW', 'View billing', 'Billing'),
  ('billing.topup',
   'Initiate credit wallet top-ups via payment gateway',
   'CRM_BILLING_TOPUP', 'Top up credits', 'Billing'),
  ('billing.admin',
   'Manage billing settings and issue manual credits',
   'CRM_BILLING_ADMIN', 'Administer billing', 'Billing')
ON CONFLICT (permission_key) DO UPDATE SET
  description = EXCLUDED.description,
  catalog_key = EXCLUDED.catalog_key,
  label = EXCLUDED.label,
  category = EXCLUDED.category;

-- ─────────────────────────────────────────────────────────────────────────────
-- Safety check: sensible_app_role must not hold BYPASSRLS
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
