# AI retrieval for the CRM assistant

The existing CRM assistant remains the only chatbot. AI retrieval is disabled by
default (`AI_RETRIEVAL_ENABLED=false`) and adds read-only lead/timeline context
to eligible assistant requests; assistant write confirmation flows do not use
retrieval. PostgreSQL leads and timeline events remain authoritative. The
indexing jobs and chunks are disposable projections, not a second record store.

## Enablement and operations

1. Apply database migrations with the normal deployment process, including
   `0041_ai_retrieval_index.sql`. Its queue triggers enqueue lead and timeline
   changes transactionally, so a source write cannot succeed without its queue
   write.
2. Configure `DATABASE_ADMIN_URL` for a dedicated maintenance login allowed to
   process every tenant's queue and bypass row-level security. Do not use the
   ordinary runtime URL for this worker. Protect the credential as a privileged
   production secret.
3. Select the embedding provider/model with `AI_EMBEDDING_PROVIDER`,
   `AI_EMBEDDING_MODEL`, and `AI_EMBEDDING_MODEL_VERSION`. The current schema
   requires 768-dimensional vectors. Configure Google AI Studio or Vertex AI
   credentials using the same Google settings as the assistant. Provider calls
   time out according to `AI_EMBEDDING_TIMEOUT_MS`.
4. Run `npm run index:ai-retrieval -- --backfill` once to enqueue missing or
   stale lead and timeline records, then run `npm run index:ai-retrieval`
   periodically to drain jobs. The worker embeds at most 100 jobs per
   invocation and backfills in 25-job batches. It leases jobs for retry safety
   and backs off transient failures. Monitor structured completion/failure
   logs and the queue's status/attempt fields.
5. Verify indexing and authorization in a staging tenant, then set
   `AI_RETRIEVAL_ENABLED=true` for the assistant. Rebuild and retry failed jobs
   by re-running the backfill worker after resolving provider errors.

The indexer sends only redacted, allowlisted lead fields and timeline event
types/payload keys to the embedding provider. It never sends complete source
rows. User questions are bounded and scrubbed before embedding. Retrieved
content is marked as untrusted prompt data. Retrieval combines exact lead
identifiers, PostgreSQL full-text search, and vector similarity; final context
is permission-checked, limited to five leads and 3,000 characters, and answers
include lead-ID citations. Requests continue to require `leads.read`; RLS
rechecks tenant, outlet, permission, source existence, and indexed source
version when chunks are read. Retrieval audit logs contain scope, counts,
latency, model/provider and outcome, not question text or retrieved content.

## Corrections, retention, and backfills

Lead and timeline triggers update a source's single idempotent queue entry.
Changed source versions return jobs to pending; replacement chunks are
upserted transactionally, while deleted or empty sources lose their chunks.
Stale-version chunks are immediately excluded by the read policy. A periodic
backfill can repair missed jobs and retry terminal failures. Use source-table
retention/access changes as the authority; do not delete or edit chunks directly
as a substitute.

## Rollback

1. Set `AI_RETRIEVAL_ENABLED=false` and redeploy. This immediately restores the
   existing assistant path without retrieval context.
2. Stop scheduled indexer runs.
3. If the feature must be removed, take the normal database backup and run
   `backend/migrations/0041_ai_retrieval_rollback.sql`. This drops only derived
   jobs/chunks and their triggers/functions; source records and timeline history
   are unchanged. Re-applying migration 0041 is required before re-enabling.

Keep the feature disabled if the configured provider, maintenance role,
retention behavior, or authorization checks have not been verified.
