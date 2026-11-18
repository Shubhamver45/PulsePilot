# PulsePilot Competition Readiness & Deployment Notes

This document describes the verified application contract and the environment-specific setup required for a complete end-to-end demonstration.

## System boundaries

| Component | Responsibility | Trust boundary |
|---|---|---|
| Next.js application | UI, orchestration, API validation | Server routes validate every private request |
| Supabase Auth | User authentication and refreshable sessions | Access tokens are validated with `auth.getUser` |
| PostgreSQL / Prisma | Organizations, projects, experiments, variants, telemetry, audit | Queries are scoped to the authenticated organization |
| Flagsmith Edge API | Read-only feature evaluation by identity | Uses the environment evaluation key |
| Flagsmith Management API | Create keyed multivariate options and change allocations | Requires a secret Organisation API token |
| Deterministic analytics | Conversion rates, uplift, Z-tests, Bayesian approximations, SRM | Computed from persisted non-synthetic exposure and conversion events |
| Release Guardian | Evidence gates and release recommendation | Human admin must approve remote mutations |

## Required environment variables

### Application and database

| Variable | Purpose | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Auth endpoint | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anon key | Public; never use a service-role key here |
| `DATABASE_URL` | Prisma pooled PostgreSQL connection | Secret |
| `DIRECT_URL` | Direct PostgreSQL connection for migrations | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional server-only account provisioning with confirmed email | Secret; never expose to browser or Preview unless intentionally scoped |

### Flagsmith

| Variable | Purpose | Exposure |
|---|---|---|
| `FLAGSMITH_PROJECT_ID` | Flagsmith project numeric ID | Server configuration |
| `FLAGSMITH_ENVIRONMENT_KEY` | Edge evaluation and identity trait calls | Secret server-side config; not a Management API token |
| `FLAGSMITH_SERVER_SIDE_API_KEY` | Edge evaluation compatibility setting | Secret server-side config; not a Management API token |
| `FLAGSMITH_ORG_API_TOKEN` | Project feature creation, keyed MV option creation and remote feature versioning | Secret; never use a browser key |
| `FLAGSMITH_API_URL` | Optional Management/Edge API base override | Server configuration |

**Important:** An environment key can evaluate flags, but it must not be treated as an Organisation Management API token. Remote creation, canary allocation, winner rollout, rollback, and kill-switch operations require `FLAGSMITH_ORG_API_TOKEN` (or an explicitly configured equivalent Management token). The application reports Management API unavailability and blocks hosted mutations instead of pretending a local mock write reached Flagsmith.

## Canonical workflows

### Create an experiment

1. An authenticated ADMIN or EDITOR submits a strategy to `POST /api/experiments/create`.
2. The application checks the user's organization and a project in that organization.
3. The Flagsmith Management API creates a MULTIVARIATE feature.
4. Each variation is created through the keyed `/mv-options/` endpoint.
5. The environment feature state is read back and the required variant keys are verified.
6. PostgreSQL persists the experiment and variants in a transaction.
7. The authenticated operator and remote creation result are recorded in the audit log.

The legacy `POST /api/flagsmith/experiment` route is intentionally disabled. Use the canonical provisioning endpoint above.

### Evaluate a visitor

1. The server sends an identity evaluation request to Flagsmith using the environment key.
2. The application uses the actual evaluated feature value/option key, not a generic default-state metadata field.
3. The demo storefront renders the mapped variant.
4. A first-touch exposure is recorded for the same experiment and stable visitor identity.

### Record conversions

A conversion is rejected unless a prior persisted exposure exists for the same experiment and identity. The first-touch exposure owns variant attribution. Each conversion also requires an order, transaction, event, or idempotency identifier. The client cannot mark a real event synthetic or choose a different variant at conversion time.

### Run synthetic traffic

The public simulator accepts only the two seeded demo experiments and has a strict rate limit. Hosted simulation creates fresh synthetic identities and evaluates them through Flagsmith. Synthetic exposure and conversion rows are persisted with `properties.isSynthetic=true`, do not increment the experiment's real sample counter, and are excluded from real scorecards, release readiness, and dashboard KPIs. The simulator reports its observed generated counts; they are not presented as real customer results.

### Approve a release

The Release Centre defaults to live persisted evidence. Sample size, Bayesian win probability, frequentist significance, sample-ratio mismatch and operational guardrails must all pass. Missing operational guardrail telemetry is treated as unknown and blocks release. A verified ADMIN must approve the action. The server mutates Flagsmith and checks the actual remote state before returning success, then synchronizes the persisted allocation and audit log.

## Local and hosted verification

Run locally with a dedicated development database and scoped Flagsmith development environment:

```bash
npm install
npx prisma generate
npm run lint
npm test
npm run test:flagsmith
npm run test:live-flagsmith
npm run build
```

The live Flagsmith tests require a valid environment evaluation key and Organisation API token. They should run against a disposable/development Flagsmith project or environment; do not run mutation tests against production feature flags without an explicit approved test plan.

For Vercel Preview, use separate credentials and an isolated database branch. Do not copy production Management tokens or production database credentials to a Preview deployment. The preview can verify read-only Flagsmith evaluation using its environment key; the Release Centre remains blocked until an intentionally scoped Management token and persistent database are configured for that preview.

## Evidence reporting rules

- Do not label a Flagsmith connection healthy unless a live edge request succeeds.
- Do not label Management API operations ready unless a Management credential and authoritative state read are verified.
- Do not present seeded demo counts as real telemetry.
- Do not include synthetic events in real experiment scorecards.
- Do not promote an experiment when sample size or guardrail evidence is missing.
- Do not report a rollout success based only on an API request being accepted; verify the post-mutation allocation state.
