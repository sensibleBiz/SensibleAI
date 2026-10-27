SET TIME ZONE 'UTC';

-- Preserve access to the WhatsApp module for outlets that already use explicit
-- feature subscriptions. Outlets without any feature rows continue to use the
-- application's default feature catalog.
INSERT INTO tenancy.outlet_features (tenant_id, outlet_id, feature_key, enabled)
SELECT DISTINCT feature.tenant_id, feature.outlet_id, 'whatsapp', true
FROM tenancy.outlet_features feature
JOIN tenancy.outlets outlet
  ON outlet.tenant_id = feature.tenant_id
 AND outlet.id = feature.outlet_id
WHERE outlet.active
ON CONFLICT (outlet_id, feature_key)
DO UPDATE SET enabled = true;