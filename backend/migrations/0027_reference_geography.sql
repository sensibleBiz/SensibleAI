SET TIME ZONE 'UTC';

CREATE SCHEMA IF NOT EXISTS reference_data AUTHORIZATION sensible_rls_owner;

CREATE TABLE reference_data.zones (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code varchar(40) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_zones_code_ck CHECK (code = upper(btrim(code)) AND length(btrim(code)) > 0),
  CONSTRAINT reference_zones_name_ck CHECK (length(btrim(name)) > 0)
);

CREATE TABLE reference_data.countries (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code varchar(3) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  official_name varchar(240) NOT NULL DEFAULT '',
  flag varchar(16) NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_countries_code_ck CHECK (code = upper(btrim(code)) AND length(btrim(code)) BETWEEN 2 AND 3),
  CONSTRAINT reference_countries_name_ck CHECK (length(btrim(name)) > 0)
);

CREATE TABLE reference_data.states (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  country_id uuid NOT NULL REFERENCES reference_data.countries(id) ON DELETE RESTRICT,
  zone_id uuid REFERENCES reference_data.zones(id) ON DELETE SET NULL,
  code varchar(12) NOT NULL,
  name varchar(160) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_states_country_code_uq UNIQUE (country_id, code),
  CONSTRAINT reference_states_country_name_uq UNIQUE (country_id, name),
  CONSTRAINT reference_states_code_ck CHECK (code = upper(btrim(code)) AND length(btrim(code)) > 0),
  CONSTRAINT reference_states_name_ck CHECK (length(btrim(name)) > 0)
);

CREATE TABLE reference_data.cities (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  state_id uuid NOT NULL REFERENCES reference_data.states(id) ON DELETE RESTRICT,
  code varchar(40) NOT NULL,
  name varchar(180) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_cities_state_code_uq UNIQUE (state_id, code),
  CONSTRAINT reference_cities_state_name_uq UNIQUE (state_id, name),
  CONSTRAINT reference_cities_code_ck CHECK (code = upper(btrim(code)) AND length(btrim(code)) > 0),
  CONSTRAINT reference_cities_name_ck CHECK (length(btrim(name)) > 0)
);

CREATE INDEX reference_zones_active_order_idx ON reference_data.zones (active, sort_order, name);
CREATE INDEX reference_countries_active_order_idx ON reference_data.countries (active, sort_order, name);
CREATE INDEX reference_states_country_active_order_idx ON reference_data.states (country_id, active, sort_order, name);
CREATE INDEX reference_states_zone_idx ON reference_data.states (zone_id, name);
CREATE INDEX reference_cities_state_active_order_idx ON reference_data.cities (state_id, active, sort_order, name);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON reference_data.zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reference_data.countries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reference_data.states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reference_data.cities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE reference_data.zones OWNER TO sensible_rls_owner;
ALTER TABLE reference_data.countries OWNER TO sensible_rls_owner;
ALTER TABLE reference_data.states OWNER TO sensible_rls_owner;
ALTER TABLE reference_data.cities OWNER TO sensible_rls_owner;

GRANT USAGE ON SCHEMA reference_data TO sensible_app_role;
GRANT SELECT ON reference_data.zones, reference_data.countries, reference_data.states, reference_data.cities TO sensible_app_role;

INSERT INTO reference_data.zones (code, name, sort_order) VALUES
  ('CENTER', 'Center', 10), ('SOUTH', 'South', 20), ('WEST', 'West', 30),
  ('EAST', 'East', 40), ('NORTH', 'North', 50)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, active = true;

INSERT INTO reference_data.countries (code, name, official_name, flag, sort_order)
VALUES ('IN', 'India', 'Republic of India', '🇮🇳', 10)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, official_name = EXCLUDED.official_name,
  flag = EXCLUDED.flag, sort_order = EXCLUDED.sort_order, active = true;

WITH seed(code, name, zone_code, sort_order) AS (VALUES
  ('AN','Andaman and Nicobar Islands','SOUTH',10), ('AP','Andhra Pradesh','SOUTH',20),
  ('AR','Arunachal Pradesh','EAST',30), ('AS','Assam','EAST',40), ('BR','Bihar','EAST',50),
  ('CH','Chandigarh','NORTH',60), ('CG','Chhattisgarh','CENTER',70),
  ('DNH','Dadra and Nagar Haveli','WEST',80), ('DD','Daman and Diu','WEST',90),
  ('DL','Delhi','NORTH',100), ('GA','Goa','WEST',110), ('GJ','Gujarat','WEST',120),
  ('HR','Haryana','NORTH',130), ('HP','Himachal Pradesh','NORTH',140),
  ('JK','Jammu and Kashmir','NORTH',150), ('JH','Jharkhand','EAST',160),
  ('KA','Karnataka','SOUTH',170), ('KL','Kerala','SOUTH',180), ('LA','Ladakh','NORTH',190),
  ('LD','Lakshadweep','SOUTH',200), ('MP','Madhya Pradesh','CENTER',210),
  ('MH','Maharashtra','WEST',220), ('MN','Manipur','EAST',230), ('ML','Meghalaya','EAST',240),
  ('MZ','Mizoram','EAST',250), ('NL','Nagaland','EAST',260), ('OD','Odisha','EAST',270),
  ('PY','Puducherry','SOUTH',280), ('PB','Punjab','NORTH',290), ('RJ','Rajasthan','NORTH',300),
  ('SK','Sikkim','EAST',310), ('TN','Tamil Nadu','SOUTH',320), ('TS','Telangana','SOUTH',330),
  ('TR','Tripura','EAST',340), ('UK','Uttarakhand','NORTH',350),
  ('UP','Uttar Pradesh','NORTH',360), ('WB','West Bengal','EAST',370)
)
INSERT INTO reference_data.states (country_id, zone_id, code, name, sort_order)
SELECT country.id, zone.id, seed.code, seed.name, seed.sort_order
FROM seed
JOIN reference_data.countries country ON country.code = 'IN'
LEFT JOIN reference_data.zones zone ON zone.code = seed.zone_code
ON CONFLICT (country_id, code) DO UPDATE SET name = EXCLUDED.name, zone_id = EXCLUDED.zone_id,
  sort_order = EXCLUDED.sort_order, active = true;
