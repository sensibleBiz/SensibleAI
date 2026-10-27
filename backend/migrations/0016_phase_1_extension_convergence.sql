-- Converges databases that recorded 0001 while its optional extension
-- declarations were locally removed. These extensions are not required by any
-- current table, so native PostgreSQL installations may safely skip them.
DO $$
DECLARE extension_name text;
BEGIN
  FOREACH extension_name IN ARRAY ARRAY['postgis', 'vector'] LOOP
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = extension_name) THEN
      EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I', extension_name);
    ELSE
      RAISE NOTICE 'Optional extension % is not installed on this PostgreSQL server; skipping', extension_name;
    END IF;
  END LOOP;
END $$;
