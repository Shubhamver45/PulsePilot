# PulsePilot AI — Track 2 Competition Submission

**Competition:** WeMakeDevs × Flagsmith Toggle Wars  
**Track:** Track 02 — AI Agents and Feature Flags  
**Live application:** https://pulse-pilot-two.vercel.app/  
**Repository:** https://github.com/Shubhamver45/PulsePilot  
**Interactive routes:** `/experiments/new`, `/demo-store`, `/integrations/flagsmith`, `/analytics`, `/release-center`

---

## Project title

**PulsePilot AI — Prompt-to-Flagsmith Experiment Agent**

## Tagline

**Turn a product hypothesis into a validated, human-approved Flagsmith experiment.**

## The problem

Product and growth teams move between several disconnected tasks to run an experiment: translate an idea into a testable hypothesis, choose a metric and guardrails, model variants, configure feature flags, instrument exposure and conversion events, interpret results, and safely release a winner. Configuration mistakes and weak statistical evidence can make an experiment unsafe or misleading.

## The solution

PulsePilot is an agent-assisted workflow built around Flagsmith as the feature-flag and remote-configuration control plane. A product manager describes an experiment in natural language. PulsePilot turns that prompt into a structured experiment plan, validates it, reviews the design, and—when the required credentials and persistent workspace are configured—provisions keyed multivariate options in Flagsmith.

The workflow is designed to distinguish planning from execution. A generated plan is not represented as a live feature until the Flagsmith Management API has returned the feature state and the actual environment allocations have been read back and verified.

## The Track 2 judge journey

1. **Describe the experiment.** Open the AI Experiment Studio and enter a prompt such as:  
   `Test a single-page checkout against the current multi-step checkout. Use a 50/50 split, optimize checkout completion, and monitor payment failures.`

2. **Generate the experiment plan.** The strategy agent returns the hypothesis, feature key, control/treatment configurations, traffic allocation, primary metric, secondary metrics, guardrails, and required instrumentation. The UI identifies whether the strategy came from Gemini or the deterministic offline planner.

3. **Validate before execution.** Zod schema checks and deterministic business rules reject invalid feature keys, duplicate variant keys or remote values, invalid percentages, allocations that do not sum to 100%, missing primary-metric events, and guardrails without matching instrumentation events.

4. **Run the readiness review.** The reviewer checks the hypothesis, measurable metrics, event plan, variant differences, guardrails, allocation and implementation feasibility. Its provider is identified as Gemini or deterministic fallback. A failed review cannot proceed to approval.

5. **Approve and provision.** An authenticated ADMIN or EDITOR submits the experiment. The server revalidates the plan and runs the readiness review again; it does not trust a client-supplied approver name or approval flag. The canonical provisioning endpoint creates or retrieves a Flagsmith multivariate feature and keyed options, reads the environment state back, and verifies the requested allocation. PostgreSQL persistence and an audit record follow the verified remote operation.

6. **Evaluate real identities.** The Demo Store requests the evaluated feature value from the Flagsmith Edge/identity API using a stable identity. It renders the returned remote configuration rather than inventing a local assignment. Different identities must be tested against a configured remote split before claiming that an A/B test is active.

7. **Record and analyze evidence.** The storefront records a first-touch exposure and a conversion for the same identity and variant. The scorecard derives counts and statistical results from persisted, non-synthetic telemetry. Insufficient samples, sample-ratio mismatch, or missing evidence must not be presented as a winner.

8. **Govern the release.** The Release Guardian checks the persisted experiment evidence and operational guardrails. An authenticated workspace administrator approves a canary, winner rollout, rollback, or kill-switch action. The server verifies the actual Flagsmith post-mutation state before reporting success.

---

## How Flagsmith is central

Flagsmith is not a decorative integration. It is the feature evaluation and remote configuration system used by the experiment workflow.

- **Edge evaluation:** The environment key is used for per-identity flag evaluation. This key is not treated as an administrative credential.
- **Multivariate experiments:** A feature has a default/control remote value and keyed multivariate options for treatment configurations.
- **Management operations:** A scoped Flagsmith Organisation API token is required for project feature creation and remote feature-state/version mutations.
- **Identity consistency:** The same stable identity should receive a consistent result for a given remote configuration. A live A/B split is only claimed after different test identities are observed receiving the configured options.
- **Allocation verification:** After provisioning or mutation, the Management API state is read back. The feature default, configured variant keys, per-variant allocation and 100% traffic invariant are checked.
- **Lifecycle control:** Flagsmith remains the source of truth for canary allocation, winner promotion, rollback and emergency disablement.

PulsePilot uses Flagsmith's multivariate feature/identity APIs and its own persisted analytics for this self-managed workflow. It does not depend on Flagsmith's separate managed Experimentation product.

---

## Technical architecture

| Layer | Implementation |
|---|---|
| Web application | Next.js App Router, React, TypeScript, Tailwind CSS |
| Prompt-to-plan | Gemini structured JSON output, Zod schema validation, deterministic offline fallback |
| Agent review | Gemini readiness reviewer with a deterministic fallback and provider disclosure |
| Feature flags | Flagsmith Edge/identity evaluation and Organisation Management API |
| Data | Supabase PostgreSQL, Prisma ORM |
| Telemetry | First-touch exposure attribution, conversion deduplication, synthetic-event separation |
| Statistics | TypeScript conversion calculations, two-proportion Z-test, Bayesian Beta-Binomial estimate and SRM check |
| Governance | Authenticated workspace roles, server-side release gates, audit history and remote read-after-write verification |
| Hosting | Vercel |

## What is automated and what remains human-controlled

The agents formulate and review the experiment plan. Deterministic validation protects the plan from malformed output. The authenticated user is still responsible for approval. Production mutations are not delegated to a model, and no UI simulation can override the server-side release gate.

## Validation evidence

The remediation branch is tested in an isolated Node/Next.js environment.

- TypeScript check: passed.
- Prompt-plan, Flagsmith allocation, and identity-assignment regression tests: 17/17 passed.
- Flagsmith integration and offline lifecycle tests: 21/21 passed.
- QA/security tests: 36/36 passed.
- Standard statistics, analytics-agent, telemetry persistence and audit persistence suites: passed.
- Optimized Next.js production build: passed; 44 application routes generated.

The automated Flagsmith suite tests credential guards, deterministic mock evaluation, canary/winner/rollback/kill-switch logic, and secret handling. It skips live Management API calls when an Organisation token is not present. These offline tests are not evidence of a remote production mutation.

## Live environment status and prerequisites

The following state was checked against the connected deployment and Flagsmith environment on **18 November 2026**:

- Flagsmith Edge evaluation is reachable and returns two flags; the observed Edge response time during this check was approximately 168 ms.
- Five stable test identities queried for `exp_checkout_layout_v2` all returned the official Flagsmith `variantKey: "control"`, while the remote-config `value` was the string `"treatment"`. This is **not** evidence of a valid control/treatment split; the remote feature's default value and actual allocation need to be reconciled in the Flagsmith Console.
- The evaluator now reads the SDK identity response's official `variant` field as the assignment key. The remote-config value is stored separately and is never treated as a variant identifier. Exposure ingestion independently re-evaluates the identity server-side before accepting a persisted exposure.
- The Flagsmith Organisation Management API token is not configured in Vercel. Keyed multivariate provisioning and remote rollout therefore remain unverified live.
- Vercel does not have a hosted `DATABASE_URL`/`DIRECT_URL` configured for Prisma. Persistent registration, experiment creation, and scorecard operations cannot be signed off end-to-end.
- A hosted `GEMINI_API_KEY` is not configured. The hosted Studio uses the disclosed deterministic planner/reviewer fallback rather than claiming that the hosted strategy was generated by Gemini.
- The latest application-code preview is READY at the preview deployment; the current branch head after that deployment adds focused tests/documentation. The GitHub Actions workflow on the current PR head completed successfully.

To complete the live demonstration, configure a scoped Flagsmith Organisation API token, an appropriately isolated PostgreSQL connection for the hosted app, and a Gemini API key. Then verify the new feature and allocations in Flagsmith, evaluate distinct identities, persist real exposures/conversions, and capture the resulting scorecard. Do not copy a production Management token or database credential into an untrusted preview.

## Upstream Flagsmith contract references

The integration was checked against the official `Flagsmith/flagsmith` source at commit `15033bd8538bccdabaa6ad87c10ce826f152b3a1`:

- [SDK identity serializer](https://github.com/Flagsmith/flagsmith/blob/15033bd8538bccdabaa6ad87c10ce826f152b3a1/api/features/serializers.py) exposes the assigned multivariate key as `variant` and labels the default arm with the reserved control key. PulsePilot uses this field for assignment and keeps the returned feature value separate.
- [Multivariate option serializer](https://github.com/Flagsmith/flagsmith/blob/15033bd8538bccdabaa6ad87c10ce826f152b3a1/api/features/multivariate/serializers.py) supports stable keyed options and validates project-level default allocation.
- [Feature-versioning API](https://github.com/Flagsmith/flagsmith/blob/15033bd8538bccdabaa6ad87c10ce826f152b3a1/api/features/versioning/views.py) defines draft creation, version-state updates, and publishing for v2 environments. [Versioning documentation](https://github.com/Flagsmith/flagsmith/blob/15033bd8538bccdabaa6ad87c10ce826f152b3a1/docs/docs/managing-flags/feature-versioning.md).
- [Multivariate evaluation tests](https://github.com/Flagsmith/flagsmith/blob/15033bd8538bccdabaa6ad87c10ce826f152b3a1/api/tests/unit/evaluation/test_unit_evaluation_services.py) verify stable per-identity bucket assignment and variant keys.

These source references establish the API contract followed by PulsePilot; they do not substitute for a successful live Management API mutation in the connected project.

## Impact statement

PulsePilot is intended to reduce the manual coordination required to design, configure and govern a product experiment. Its value proposition is the connected prompt-to-flag workflow and the checks around it—not a claimed conversion lift. No production business uplift or time-saved figure is asserted until a real customer cohort has generated sufficient persisted evidence.

## Submission links

- **Application:** https://pulse-pilot-two.vercel.app/
- **Repository:** https://github.com/Shubhamver45/PulsePilot
- **Experiment Studio:** https://pulse-pilot-two.vercel.app/experiments/new
- **Flagsmith status:** https://pulse-pilot-two.vercel.app/integrations/flagsmith
- **Interactive storefront:** https://pulse-pilot-two.vercel.app/demo-store
- **Analytics:** https://pulse-pilot-two.vercel.app/analytics
- **Release Guardian:** https://pulse-pilot-two.vercel.app/release-center
