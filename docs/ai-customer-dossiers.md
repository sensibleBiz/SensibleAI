# AI customer dossiers

AI customer dossiers are optional, derived lead/customer context. CRM tables and
`crm.timeline_events` remain authoritative; dossier output is never written back
to a verified CRM field.

## Rollout gates

Both gates must be enabled:

1. Set `AI_CUSTOMER_DOSSIERS_ENABLED=true` for the API and worker deployment.
2. Enable the `ai_customer_dossiers` feature for an individual outlet.

The outlet feature is excluded from default and "enable all" feature sets.
Creating or changing CRM records does not enroll a subject. An authorized user
must explicitly request its first dossier.

## API

All routes use PostgreSQL authentication and enforce the matching outlet/source
permission (`leads.read` or `customers.read`).

- `POST /leads/:leadId/dossier` with `{ "outletId": "..." }`
- `GET /leads/:leadId/dossier?outletId=...`
- `POST /leads/:leadId/dossier/feedback` with
  `{ "outletId": "...", "useful": true, "note": "optional" }`
- Equivalent routes under `/customers/:customerId/dossier`.

Requesting synthesis returns `202` and a `pending` or `stale` dossier. No model
call runs in the request transaction.

## Worker

Run `npm run synthesize:ai-dossiers` from `backend` on a recurring job. The
worker requires `DATABASE_ADMIN_URL` and a configured Google AI provider. It:

- verifies the requesting user's current tenant, outlet, feature and source permission;
- claims work with a lease and `SKIP LOCKED`;
- caps daily provider calls per outlet;
- retries with bounded exponential backoff and marks terminal failures;
- compares the lease after synthesis so a source mutation cannot publish stale output;
- records source watermark/version, model/version, latency, tokens and estimated cost;
- purges ready/failed dossiers after their configured retention date.

Provider price environment variables default to zero. Set them to the selected
model's current micro-currency cost per million tokens before evaluating spend.

## Interpretation

Facts, stated needs, explicit budgets and decision makers carry source evidence
references. Seller quotations are explicitly rejected as proof of customer
budget. Suggested actions and estimated risks are separate from facts. Win
probability and churn risk are schema-enforced as uncalibrated until a future
outcome-validation migration defines a calibration process.

