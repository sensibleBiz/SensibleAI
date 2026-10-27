# Governed AI actions

AI action proposals are separate from ordinary assistant answers and from the
assistant's existing human-confirmed sales-target flow. Migration
`0043_ai_agent_actions.sql` creates an outlet-scoped proposal store and an
append-only state-transition history. The proposal is immutable after creation;
review, mock execution, failure, and cancellation are separate recorded state
transitions.

## Safe rollout

`AI_AGENT_ACTIONS_ENABLED` defaults to `false`. Apply migration 0043 and grant
the outlet permissions before enabling the `/api/v1/ai-actions` routes:

- `ai_actions.read` to users who may view proposals and their audit history.
- `ai_actions.propose` to users/agents that may submit proposals.
- `ai_actions.review` only to designated human reviewers.
- The corresponding source permission (`leads.update`, `leads.assign`,
  `customers.read`, or `whatsapp.messages.send`) is rechecked at proposal,
  review, and mock execution time.

The API identifies proposals as `sensible-crm-assistant` and records the
configured assistant model. Token and estimated-cost fields are nullable until
trusted provider usage is available; callers cannot populate them. Summaries
are concise user-facing decisions, not hidden chain-of-thought. Context is
limited to typed record references; message text, customer contact data, and
prompt transcripts are not accepted in proposed payloads.

## State and execution policy

Only `PROPOSED -> APPROVED | REJECTED | CANCELLED`,
`APPROVED -> EXECUTED | FAILED | CANCELLED`, and `FAILED -> CANCELLED` are
allowed. The proposer cannot approve or reject their own action. All action
types, including stage changes, assignment, disqualification, and customer
messages, require explicit human approval. RLS checks tenant, outlet, and the
read/propose/review permissions; source-record permissions and target state are
revalidated again before execution.

Execution is intentionally a mock only. It makes read-only checks, records a
simulated result, and never invokes lead/customer write services, messaging
providers, or external side effects. The database also enforces
`execution_mode = 'mock'`. An executed retry returns the stored result without
running the mock again; unique idempotency keys prevent duplicate proposals.
Real execution would require a separately reviewed change with operation-
specific transactional business-rule validation, an outbox/idempotency boundary
for external side effects, and tested compensation procedures. This migration
does not enable that capability.

## API outline

- `POST /api/v1/ai-actions` creates an idempotent proposal.
- `GET /api/v1/ai-actions?outletId=...` lists proposals with bounded pagination.
- `GET /api/v1/ai-actions/:actionId/history?outletId=...` reads the action and
  its actor-attributed history.
- `POST /api/v1/ai-actions/:actionId/review?outletId=...` approves or rejects.
- `POST /api/v1/ai-actions/:actionId/execute?outletId=...` runs safe mock
  validation only.
- `POST /api/v1/ai-actions/:actionId/cancel?outletId=...` cancels an eligible
  proposal.

The history records actor IDs, status transitions, reason codes, timestamps,
and non-sensitive error codes; it excludes proposal payloads, customer
identifiers beyond the linked action, and free-form decision text.

## Rollback

Set `AI_AGENT_ACTIONS_ENABLED=false` and stop clients from submitting proposals.
After taking the standard database backup, run
`backend/migrations/0043_ai_agent_actions_rollback.sql` to remove the action
tables and transition triggers. The rollback leaves the permission catalog
entries in place so existing role assignments are not silently deleted.
Proposal history is removed with the action tables; export it first if retention
or investigation requirements apply.
