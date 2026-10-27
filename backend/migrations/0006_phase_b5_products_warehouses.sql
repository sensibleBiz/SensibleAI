SET TIME ZONE 'UTC';

DO $$ BEGIN CREATE TYPE crm.stock_movement_type AS ENUM ('OPENING', 'PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE crm.stock_adjustment_type AS ENUM ('CORRECTION', 'COUNT', 'DAMAGE', 'EXPIRED', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE crm.warehouse_transfer_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'PARTIALLY_ACCEPTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Product Categories
CREATE TABLE crm.product_categories (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT product_categories_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX product_categories_tenant_idx ON crm.product_categories (tenant_id, active, is_deleted);
CREATE INDEX product_categories_name_idx ON crm.product_categories (tenant_id, name text_pattern_ops);

-- 2. Products
CREATE TABLE crm.products (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  name text NOT NULL,
  sku varchar(128) NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  category_id uuid REFERENCES crm.product_categories(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  mrp_price numeric(14,2) NOT NULL DEFAULT 0,
  price numeric(14,2) NOT NULL DEFAULT 0,
  purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_percent numeric(5,2) NOT NULL DEFAULT 0,
  is_add_on boolean NOT NULL DEFAULT false,
  min_unit jsonb NOT NULL DEFAULT '{}'::jsonb,
  uid_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT products_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT products_prices_ck CHECK (mrp_price >= 0 AND price >= 0 AND purchase_price >= 0 AND tax_percent >= 0)
);
CREATE INDEX products_tenant_idx ON crm.products (tenant_id, is_deleted, active);
CREATE INDEX products_tenant_category_idx ON crm.products (tenant_id, category_id);
CREATE INDEX products_tenant_sku_idx ON crm.products (tenant_id, sku) WHERE sku <> '';
CREATE INDEX products_tenant_name_idx ON crm.products (tenant_id, name text_pattern_ops);

-- 3. Product Outlets (Availability Mapping)
CREATE TABLE crm.product_outlets (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_outlets_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT product_outlets_product_tenant_fk FOREIGN KEY (tenant_id, product_id)
    REFERENCES crm.products(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT product_outlets_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT product_outlets_product_outlet_uq UNIQUE (product_id, outlet_id)
);
CREATE INDEX product_outlets_tenant_outlet_idx ON crm.product_outlets (tenant_id, outlet_id, active);

-- 4. Warehouses
CREATE TABLE crm.warehouses (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  name text NOT NULL,
  code varchar(64) NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT warehouses_business_tenant_fk FOREIGN KEY (tenant_id, business_id)
    REFERENCES tenancy.businesses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouses_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX warehouses_tenant_outlet_idx ON crm.warehouses (tenant_id, outlet_id, is_deleted, active);

-- 5. Warehouse Stock
CREATE TABLE crm.warehouse_stock (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  reorder_level numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_stock_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT warehouse_stock_warehouse_tenant_fk FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES crm.warehouses(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT warehouse_stock_product_tenant_fk FOREIGN KEY (tenant_id, product_id)
    REFERENCES crm.products(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT warehouse_stock_warehouse_product_uq UNIQUE (warehouse_id, product_id),
  CONSTRAINT warehouse_stock_quantity_nonnegative_ck CHECK (quantity >= 0)
);
CREATE INDEX warehouse_stock_tenant_warehouse_idx ON crm.warehouse_stock (tenant_id, warehouse_id);
CREATE INDEX warehouse_stock_tenant_product_idx ON crm.warehouse_stock (tenant_id, product_id);

-- 6. Stock Ledger
CREATE TABLE crm.stock_ledger (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  product_id uuid NOT NULL,
  movement_type crm.stock_movement_type NOT NULL,
  quantity numeric(14,2) NOT NULL,
  balance_after numeric(14,2) NOT NULL,
  reference_id varchar(128),
  remarks text NOT NULL DEFAULT '',
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_ledger_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT stock_ledger_warehouse_tenant_fk FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES crm.warehouses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT stock_ledger_product_tenant_fk FOREIGN KEY (tenant_id, product_id)
    REFERENCES crm.products(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX stock_ledger_tenant_product_idx ON crm.stock_ledger (tenant_id, product_id, created_at DESC);
CREATE INDEX stock_ledger_tenant_warehouse_idx ON crm.stock_ledger (tenant_id, warehouse_id, created_at DESC);

-- 7. Stock Adjustments
CREATE TABLE crm.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  adjustment_type crm.stock_adjustment_type NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_adjustments_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT stock_adjustments_warehouse_tenant_fk FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES crm.warehouses(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX stock_adjustments_tenant_warehouse_idx ON crm.stock_adjustments (tenant_id, warehouse_id, created_at DESC);

CREATE TABLE crm.stock_adjustment_items (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL,
  adjustment_id uuid NOT NULL,
  product_id uuid NOT NULL,
  previous_quantity numeric(14,2) NOT NULL,
  new_quantity numeric(14,2) NOT NULL,
  difference_quantity numeric(14,2) NOT NULL,
  CONSTRAINT stock_adjustment_items_adjustment_tenant_fk FOREIGN KEY (tenant_id, adjustment_id)
    REFERENCES crm.stock_adjustments(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT stock_adjustment_items_product_tenant_fk FOREIGN KEY (tenant_id, product_id)
    REFERENCES crm.products(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX stock_adjustment_items_adjustment_idx ON crm.stock_adjustment_items (tenant_id, adjustment_id);

-- 8. Warehouse Transfers
CREATE TABLE crm.warehouse_transfers (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  product_id uuid NOT NULL,
  from_warehouse_id uuid NOT NULL,
  to_warehouse_id uuid NOT NULL,
  requested_quantity numeric(14,2) NOT NULL,
  accepted_quantity numeric(14,2),
  rejected_quantity numeric(14,2),
  status crm.warehouse_transfer_status NOT NULL DEFAULT 'PENDING',
  requested_by_user_id uuid NOT NULL REFERENCES iam.users(id) ON DELETE RESTRICT,
  action_taken_by_user_id uuid REFERENCES iam.users(id) ON DELETE RESTRICT,
  request_date timestamptz NOT NULL DEFAULT now(),
  action_date timestamptz,
  remarks text NOT NULL DEFAULT '',
  rejection_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_transfers_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT warehouse_transfers_from_wh_tenant_fk FOREIGN KEY (tenant_id, from_warehouse_id)
    REFERENCES crm.warehouses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_transfers_to_wh_tenant_fk FOREIGN KEY (tenant_id, to_warehouse_id)
    REFERENCES crm.warehouses(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_transfers_product_tenant_fk FOREIGN KEY (tenant_id, product_id)
    REFERENCES crm.products(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_transfers_quantities_ck CHECK (
    requested_quantity > 0 AND
    (accepted_quantity IS NULL OR accepted_quantity >= 0) AND
    (rejected_quantity IS NULL OR rejected_quantity >= 0)
  )
);
CREATE INDEX warehouse_transfers_tenant_outlet_idx ON crm.warehouse_transfers (tenant_id, outlet_id, status, request_date DESC);

-- Triggers for updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.product_outlets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.warehouses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.warehouse_stock FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.warehouse_transfers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS Helper Functions
CREATE OR REPLACE FUNCTION crm.can_access_product(requested_tenant_id uuid, requested_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND (
      tenancy.is_tenant_admin(requested_tenant_id) OR
      EXISTS (
        SELECT 1 FROM crm.product_outlets po
        WHERE po.tenant_id = requested_tenant_id
          AND po.product_id = requested_product_id
          AND tenancy.can_access_outlet(po.tenant_id, po.outlet_id)
      ) OR
      NOT EXISTS (
        SELECT 1 FROM crm.product_outlets po
        WHERE po.tenant_id = requested_tenant_id
          AND po.product_id = requested_product_id
      )
    )
$$;
ALTER FUNCTION crm.can_access_product(uuid, uuid) OWNER TO sensible_rls_owner;

CREATE OR REPLACE FUNCTION crm.can_access_warehouse(requested_tenant_id uuid, requested_warehouse_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, crm, tenancy, iam
AS $$
  SELECT requested_tenant_id = tenancy.current_tenant_id()
    AND tenancy.has_tenant_access(requested_tenant_id)
    AND EXISTS (
      SELECT 1 FROM crm.warehouses w
      WHERE w.tenant_id = requested_tenant_id
        AND w.id = requested_warehouse_id
        AND tenancy.can_access_outlet(w.tenant_id, w.outlet_id)
    )
$$;
ALTER FUNCTION crm.can_access_warehouse(uuid, uuid) OWNER TO sensible_rls_owner;

-- RLS Policies
ALTER TABLE crm.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.product_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY product_categories_select ON crm.product_categories FOR SELECT USING (tenancy.has_tenant_access(tenant_id));
CREATE POLICY product_categories_insert ON crm.product_categories FOR INSERT WITH CHECK (tenancy.has_tenant_access(tenant_id) AND created_by_user_id = iam.current_user_id() AND updated_by_user_id = iam.current_user_id());
CREATE POLICY product_categories_update ON crm.product_categories FOR UPDATE USING (tenancy.has_tenant_access(tenant_id)) WITH CHECK (tenancy.has_tenant_access(tenant_id) AND updated_by_user_id = iam.current_user_id());
CREATE POLICY product_categories_delete ON crm.product_categories FOR DELETE USING (tenancy.has_tenant_access(tenant_id));

ALTER TABLE crm.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_select ON crm.products FOR SELECT USING (crm.can_access_product(tenant_id, id));
CREATE POLICY products_insert ON crm.products FOR INSERT WITH CHECK (tenancy.has_tenant_access(tenant_id) AND created_by_user_id = iam.current_user_id() AND updated_by_user_id = iam.current_user_id());
CREATE POLICY products_update ON crm.products FOR UPDATE USING (crm.can_access_product(tenant_id, id)) WITH CHECK (crm.can_access_product(tenant_id, id) AND updated_by_user_id = iam.current_user_id());
CREATE POLICY products_delete ON crm.products FOR DELETE USING (crm.can_access_product(tenant_id, id));

ALTER TABLE crm.product_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.product_outlets FORCE ROW LEVEL SECURITY;
CREATE POLICY product_outlets_isolation ON crm.product_outlets USING (tenancy.can_access_outlet(tenant_id, outlet_id)) WITH CHECK (tenancy.can_access_outlet(tenant_id, outlet_id));

ALTER TABLE crm.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.warehouses FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouses_select ON crm.warehouses FOR SELECT USING (tenancy.can_access_outlet(tenant_id, outlet_id));
CREATE POLICY warehouses_insert ON crm.warehouses FOR INSERT WITH CHECK (tenancy.can_access_outlet(tenant_id, outlet_id) AND created_by_user_id = iam.current_user_id() AND updated_by_user_id = iam.current_user_id());
CREATE POLICY warehouses_update ON crm.warehouses FOR UPDATE USING (tenancy.can_access_outlet(tenant_id, outlet_id)) WITH CHECK (tenancy.can_access_outlet(tenant_id, outlet_id) AND updated_by_user_id = iam.current_user_id());
CREATE POLICY warehouses_delete ON crm.warehouses FOR DELETE USING (tenancy.can_access_outlet(tenant_id, outlet_id));

ALTER TABLE crm.warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.warehouse_stock FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouse_stock_select ON crm.warehouse_stock FOR SELECT USING (crm.can_access_warehouse(tenant_id, warehouse_id));
CREATE POLICY warehouse_stock_insert ON crm.warehouse_stock FOR INSERT WITH CHECK (crm.can_access_warehouse(tenant_id, warehouse_id));
CREATE POLICY warehouse_stock_update ON crm.warehouse_stock FOR UPDATE USING (crm.can_access_warehouse(tenant_id, warehouse_id)) WITH CHECK (crm.can_access_warehouse(tenant_id, warehouse_id));
CREATE POLICY warehouse_stock_delete ON crm.warehouse_stock FOR DELETE USING (crm.can_access_warehouse(tenant_id, warehouse_id));

ALTER TABLE crm.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.stock_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_ledger_select ON crm.stock_ledger FOR SELECT USING (tenancy.can_access_outlet(tenant_id, outlet_id));
CREATE POLICY stock_ledger_insert ON crm.stock_ledger FOR INSERT WITH CHECK (tenancy.can_access_outlet(tenant_id, outlet_id) AND created_by_user_id = iam.current_user_id());

ALTER TABLE crm.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.stock_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_adjustments_select ON crm.stock_adjustments FOR SELECT USING (tenancy.can_access_outlet(tenant_id, outlet_id));
CREATE POLICY stock_adjustments_insert ON crm.stock_adjustments FOR INSERT WITH CHECK (tenancy.can_access_outlet(tenant_id, outlet_id) AND created_by_user_id = iam.current_user_id());

ALTER TABLE crm.stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.stock_adjustment_items FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_adjustment_items_select ON crm.stock_adjustment_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM crm.stock_adjustments sa
    WHERE sa.tenant_id = crm.stock_adjustment_items.tenant_id
      AND sa.id = crm.stock_adjustment_items.adjustment_id
      AND tenancy.can_access_outlet(sa.tenant_id, sa.outlet_id)
  )
);
CREATE POLICY stock_adjustment_items_insert ON crm.stock_adjustment_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM crm.stock_adjustments sa
    WHERE sa.tenant_id = crm.stock_adjustment_items.tenant_id
      AND sa.id = crm.stock_adjustment_items.adjustment_id
      AND tenancy.can_access_outlet(sa.tenant_id, sa.outlet_id)
  )
);

ALTER TABLE crm.warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.warehouse_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouse_transfers_select ON crm.warehouse_transfers FOR SELECT USING (tenancy.can_access_outlet(tenant_id, outlet_id));
CREATE POLICY warehouse_transfers_insert ON crm.warehouse_transfers FOR INSERT WITH CHECK (
  tenancy.can_access_outlet(tenant_id, outlet_id) AND requested_by_user_id = iam.current_user_id()
);
CREATE POLICY warehouse_transfers_update ON crm.warehouse_transfers FOR UPDATE USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
) WITH CHECK (
  tenancy.can_access_outlet(tenant_id, outlet_id)
);

-- Seed IAM Permissions
INSERT INTO iam.permissions (permission_key, description) VALUES
  ('products.read', 'View PostgreSQL products'),
  ('products.create', 'Create PostgreSQL products'),
  ('products.update', 'Update PostgreSQL products'),
  ('products.archive', 'Archive PostgreSQL products'),
  ('categories.read', 'View PostgreSQL product categories'),
  ('categories.create', 'Create PostgreSQL product categories'),
  ('categories.update', 'Update PostgreSQL product categories'),
  ('categories.archive', 'Archive PostgreSQL product categories'),
  ('warehouses.read', 'View PostgreSQL warehouses'),
  ('warehouses.create', 'Create PostgreSQL warehouses'),
  ('warehouses.update', 'Update PostgreSQL warehouses'),
  ('warehouses.archive', 'Archive PostgreSQL warehouses'),
  ('inventory.read', 'View PostgreSQL warehouse inventory and stock'),
  ('inventory.adjust', 'Perform PostgreSQL stock adjustments'),
  ('inventory.transfer', 'Create and review PostgreSQL warehouse transfers')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

-- Permissions and grants
GRANT SELECT, INSERT, UPDATE, DELETE ON
  crm.product_categories,
  crm.products,
  crm.product_outlets,
  crm.warehouses,
  crm.warehouse_stock,
  crm.stock_ledger,
  crm.stock_adjustments,
  crm.stock_adjustment_items,
  crm.warehouse_transfers
TO sensible_app_role;

GRANT EXECUTE ON FUNCTION
  crm.can_access_product(uuid, uuid),
  crm.can_access_warehouse(uuid, uuid)
TO sensible_app_role;

