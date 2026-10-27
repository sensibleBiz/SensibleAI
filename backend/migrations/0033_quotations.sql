SET TIME ZONE 'UTC';

CREATE TABLE crm.quotations (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL,
  lead_id uuid,
  quotation_number varchar(80) NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_mobile varchar(32) NOT NULL DEFAULT '',
  currency_code char(3) NOT NULL DEFAULT 'INR',
  incoterm varchar(3),
  terms text NOT NULL DEFAULT '',
  subtotal numeric(16,2) NOT NULL,
  discount_amount numeric(16,2) NOT NULL,
  tax_percent numeric(5,2) NOT NULL DEFAULT 18,
  tax_amount numeric(16,2) NOT NULL,
  total_amount numeric(16,2) NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotations_tenant_id_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT quotations_outlet_number_uq UNIQUE (tenant_id, outlet_id, quotation_number),
  CONSTRAINT quotations_outlet_tenant_fk FOREIGN KEY (tenant_id, outlet_id)
    REFERENCES tenancy.outlets(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT quotations_lead_tenant_fk FOREIGN KEY (tenant_id, lead_id)
    REFERENCES crm.leads(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT quotations_creator_membership_fk FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES tenancy.tenant_memberships(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT quotations_currency_ck CHECK (currency_code IN ('USD', 'EUR', 'INR')),
  CONSTRAINT quotations_incoterm_ck CHECK (
    incoterm IS NULL OR incoterm IN ('EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF')
  ),
  CONSTRAINT quotations_amounts_ck CHECK (
    subtotal >= 0 AND discount_amount >= 0 AND tax_percent >= 0
    AND tax_amount >= 0 AND total_amount >= 0
  )
);

CREATE TABLE crm.quotation_items (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  quotation_id uuid NOT NULL,
  product_id uuid,
  line_number integer NOT NULL,
  product_name text NOT NULL,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  mrp_unit_price numeric(16,2) NOT NULL,
  unit_price numeric(16,2) NOT NULL,
  line_subtotal numeric(16,2) NOT NULL,
  discount_amount numeric(16,2) NOT NULL,
  tax_amount numeric(16,2) NOT NULL,
  line_total numeric(16,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotation_items_quotation_line_uq UNIQUE (quotation_id, line_number),
  CONSTRAINT quotation_items_quotation_tenant_fk FOREIGN KEY (tenant_id, quotation_id)
    REFERENCES crm.quotations(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT quotation_items_product_tenant_fk FOREIGN KEY (tenant_id, product_id)
    REFERENCES crm.products(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT quotation_items_values_ck CHECK (
    line_number > 0 AND length(btrim(product_name)) > 0 AND quantity > 0
    AND mrp_unit_price >= 0 AND unit_price >= 0 AND unit_price <= mrp_unit_price
    AND line_subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND line_total >= 0
  )
);

CREATE INDEX quotations_outlet_created_idx
  ON crm.quotations (tenant_id, outlet_id, created_at DESC, id DESC);
CREATE INDEX quotations_lead_created_idx
  ON crm.quotations (tenant_id, lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX quotation_items_quotation_idx ON crm.quotation_items (tenant_id, quotation_id, line_number);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON crm.quotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE crm.quotations OWNER TO sensible_rls_owner;
ALTER TABLE crm.quotation_items OWNER TO sensible_rls_owner;
ALTER TABLE crm.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.quotations FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.quotation_items FORCE ROW LEVEL SECURITY;

CREATE POLICY quotations_select ON crm.quotations FOR SELECT USING (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'leads.read')
);
CREATE POLICY quotations_insert ON crm.quotations FOR INSERT WITH CHECK (
  tenancy.can_access_outlet(tenant_id, outlet_id)
  AND created_by_user_id = iam.current_user_id()
  AND iam.has_outlet_permission(tenant_id, outlet_id, 'leads.create')
);
CREATE POLICY quotation_items_select ON crm.quotation_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM crm.quotations quotation
    WHERE quotation.tenant_id = quotation_items.tenant_id
      AND quotation.id = quotation_items.quotation_id)
);
CREATE POLICY quotation_items_insert ON crm.quotation_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM crm.quotations quotation
    WHERE quotation.tenant_id = quotation_items.tenant_id
      AND quotation.id = quotation_items.quotation_id
      AND quotation.created_by_user_id = iam.current_user_id())
);

GRANT SELECT, INSERT ON crm.quotations TO sensible_app_role;
GRANT SELECT, INSERT ON crm.quotation_items TO sensible_app_role;
