-- Enable pgvector extension only when it is available in this PostgreSQL installation.
-- On systems where pgvector is not installed, this migration is a no-op.
-- To add embeddings later: install pgvector, then run the statements below manually.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
    EXECUTE 'ALTER TABLE crm.leads ADD COLUMN IF NOT EXISTS embedding vector(768)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS leads_embedding_idx ON crm.leads USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    EXECUTE 'GRANT SELECT (embedding) ON crm.leads TO sensible_app_role';
  END IF;
END $$;
