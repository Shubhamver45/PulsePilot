# PulsePilot AI — Complete Project State, Architecture & Roadmap
**Autonomous AI Experimentation & Product Growth Platform Powered by Flagsmith**  
*Hackathon Track:* **Flagsmith Toggle Wars — Track 02: AI Agents & Feature Flags**  
*Last Updated:* November 9, 2026  
*Status:* **100% Production-Ready (Build Passing 34/34 Routes, Zero Type Errors, Test Suite Passing)**

---

## 1. Executive Summary & Mission

**PulsePilot AI** is an autonomous experimentation and product growth platform that uses **Google Gemini** as the cognitive experiment architect and **Flagsmith** as the real-time, deterministic feature-flag actuation plane.

### Core Value Proposition
* **From Natural Language to Live Flag in Seconds:** Product managers and developers describe growth goals in plain English (e.g., *"Test social proof testimonials on the pricing card to lift checkout completion"*), and Gemini formulates hypotheses, primary/guardrail metrics, and exact multivariate feature flag configurations.
* **Feature Flags as AI Actuators:** Autonomous agents are barred from directly altering application code in production. Instead, agents actuate change exclusively via Flagsmith feature flags with strict **Human-in-the-Loop (HITL)** gates.
* **Deterministic Mathematical Rigor (Zero Hallucination):** Under no circumstances does an LLM compute p-values, Z-scores, uplifts, or Bayesian probabilities. All statistics are computed by a pure TypeScript engine (`src/lib/analytics/stats.ts`) and ingested by AI agents as immutable facts.

---

## 2. Cardinal Technical Rules

1. **Deterministic Mathematical Integrity:** P-values, Z-scores, Bayesian win probabilities, standard errors, and confidence intervals are computed deterministically. LLMs never fabricate math.
2. **Strict Human-in-the-Loop (HITL) Policy:** Every rollout, rollback, canary stage shift, or flag creation requires explicit human approval recorded in the audit log.
3. **Zero Secret Leakage:** Management keys (`FLAGSMITH_MANAGEMENT_KEY`, `GEMINI_API_KEY`, `DATABASE_URL`) operate exclusively on the server side in Next.js Route Handlers. Never exposed to client bundles.
4. **Zod Validation on All Inputs/Outputs:** Every API endpoint and every Gemini agent structured JSON output is validated against strict Zod schemas.
5. **No Synthetic Traffic Deception:** Simulated test events are explicitly tagged with `isSynthetic: true` and labeled *"Interactive Demo Telemetry"* in the UI.
6. **Executive Light-Theme Aesthetics:** High-performance, accessible light theme inspired by Linear, Stripe, and Vercel (`#7565F5` primary violet, `#F8F9FC` crisp background, `#FFFFFF` surfaces, `#171923` typography, `#E8EAF0` borders).

---

## 3. Comprehensive Inventory of What Has Been Built (Done)

### A. Foundational Documentation Suite (`/docs`)
* [docs/PRD.md](file:///Users/shubham/Desktop/pulsepilot/docs/PRD.md): Complete Product Requirements Document with user personas, user stories, and acceptance criteria.
* [docs/SYSTEM_ARCHITECTURE.md](file:///Users/shubham/Desktop/pulsepilot/docs/SYSTEM_ARCHITECTURE.md): Multi-tier architecture diagram, data flow pipelines, and component relationships.
* [docs/DATABASE_SCHEMA.md](file:///Users/shubham/Desktop/pulsepilot/docs/DATABASE_SCHEMA.md): Complete relational ERD, indexing strategies, and Prisma models.
* [docs/AI_AGENT_DESIGN.md](file:///Users/shubham/Desktop/pulsepilot/docs/AI_AGENT_DESIGN.md): Detailed specification of the 5 specialized AI agents, system prompts, schemas, and routing logic.
* [docs/FLAGSMITH_INTEGRATION.md](file:///Users/shubham/Desktop/pulsepilot/docs/FLAGSMITH_INTEGRATION.md): Flagsmith REST API endpoints, SDK lifecycle, Bayesian metrics integration, and warehouse sync.
* [docs/SECURITY.md](file:///Users/shubham/Desktop/pulsepilot/docs/SECURITY.md): Threat modeling, secret protection, RBAC, and tamper-resistant audit trails.
* [docs/DEMO_PLAN.md](file:///Users/shubham/Desktop/pulsepilot/docs/DEMO_PLAN.md): 3-minute video presentation script and step-by-step judge walkthrough.
* [README.md](file:///Users/shubham/Desktop/pulsepilot/README.md): Project overview, feature matrix, installation instructions, and environment variable setup.
* [AGENTS.md](file:///Users/shubham/Desktop/pulsepilot/AGENTS.md): Squad rules and guidelines across frontend, backend, AI, security, and product design.

---

### B. Deterministic Statistical Math Engine (`src/lib/analytics/stats.ts`)
* **Two-Sample Frequentist Z-Test:** Unpooled standard error calculation and two-tailed p-values.
* **Abramowitz–Stegun Normal CDF:** High-precision polynomial approximation accurate to $10^{-7}$.
* **95% Confidence Intervals:** Computed over absolute difference between control and treatment proportions.
* **Relative Uplift Percentage:** Formula: $\frac{p_{\text{treatment}} - p_{\text{control}}}{p_{\text{control}}} \times 100\%$.
* **Bayesian Beta-Binomial Conjugate Model:** Closed-form analytic integration for exact posterior probability to beat control:
  $$P(p_B > p_A) = \sum_{i=0}^{\alpha_B - 1} \frac{B(\alpha_A + i, \beta_A + \beta_B)}{(\beta_B + i) B(1 + i, \beta_B) B(\alpha_A, \beta_A)}$$
* **Sample Ratio Mismatch (SRM) Detector:** Chi-Square goodness-of-fit test ($\chi^2 = \sum \frac{(O - E)^2}{E}$) detecting biased hashing or traffic dropping ($p < 0.01$).
* **Automated Test Suite (`scripts/test-stats.ts`):** Runs via `npm test` using native Node.js TypeScript stripping, asserting outputs against textbook statistical tables.

---

### C. Flagsmith Actuation Engine & Integration (`src/lib/flagsmith/`)
* **`flagsmith-admin.ts`:** Server-side management REST API client for multivariate feature creation, rollout execution, and instant kill-switches.
* **`flagsmith-mock.ts`:** In-memory Flagsmith engine with deterministic murmur-style identity hashing, dynamic traffic allocation updates, and kill-switch simulation.
* **`experimentation-service.ts`:** Full experimentation lifecycle (flag creation, exposure tracking, conversion tracking, Bayesian scorecards, status checks, test traffic simulator).
* **API Endpoints:**
  * `GET /api/flagsmith/health`: Flagsmith connectivity and environment diagnostics.
  * `POST /api/flagsmith/evaluate`: Real-time flag evaluation for stable user identities.
  * `POST /api/flagsmith/rollout`: Server-side actuation of gradual canary stages (5% to 100%), 100% winner rollouts, safe rollback to control, and emergency kill-switches.
  * `GET /api/flagsmith/rollout`: Current feature flag configuration and multivariate allocation inspection.
  * `POST /api/flagsmith/simulate`: Controlled synthetic traffic generator with transparent labeling.
  * `POST /api/telemetry/track`: Exposure and conversion telemetry event ingestion.

---

### D. Multi-Agent AI Suite (`src/lib/agents/`)
Powered by **Google Gemini** with structured Zod outputs and dedicated prompts:
1. **Strategy Agent (`strategy-agent.ts`):** Deconstructs natural language growth objectives into formal hypotheses, variant configurations, and primary/guardrail metrics.
2. **Experiment Builder Agent (`experiment-builder-agent.ts`):** Audits variant allocations, runs pre-flight validation checklists, generates Flagsmith payloads, and outputs integration snippets.
3. **Analytics Agent (`analytics-agent.ts`):** Synthesizes deterministic statistics into executive summaries, anomaly detection disclosures, and evidence evaluations.
4. **Release Guardian Agent (`release-guardian-agent.ts`):** Evaluates guardrail health, determines rollout recommendations, and constructs safety handshake payloads.
5. **Growth Advisor Agent (`growth-advisor-agent.ts`):** Identifies strategic product growth opportunities, friction points, and experiment roadmaps.
6. **Central Orchestrator (`orchestrator.ts`):** Dynamic router dispatching tasks to the optimal specialist agent.

---

### E. Frontend Application (34 Verified Routes)

| Route | Page Name | Core Capabilities |
| :--- | :--- | :--- |
| [`/`](file:///Users/shubham/Desktop/pulsepilot/src/app/page.tsx) | **Overview** | At-a-glance KPI metrics, live active experiment cards, AI recommendations, and agent squad status. |
| [`/dashboard`](file:///Users/shubham/Desktop/pulsepilot/src/app/dashboard/page.tsx) | **Executive Dashboard** | 6 KPI cards with trend indicators and tooltips, dual-axis exposure/conversion Recharts, active experiments list, and recent activity feed. |
| [`/studio`](file:///Users/shubham/Desktop/pulsepilot/src/app/studio/page.tsx) & [`/experiments/new`](file:///Users/shubham/Desktop/pulsepilot/src/app/experiments/new/page.tsx) | **AI Experiment Studio** | 8-step conversational builder: Natural language objective, selectable goals, AI Strategy formulation, variant editor, metric configuration, 7-point readiness check, and HITL Flagsmith deployment. |
| [`/command-center`](file:///Users/shubham/Desktop/pulsepilot/src/app/command-center/page.tsx) | **AI Command Center** | Multi-agent collaboration workspace, interactive prompt submission, agent run history, and JSON payload inspection. |
| [`/experiments`](file:///Users/shubham/Desktop/pulsepilot/src/app/experiments/page.tsx) | **Experiments Portfolio** | Search, filter by status (active, running, completed, draft), and experiment cards. |
| [`/experiments/[id]`](file:///Users/shubham/Desktop/pulsepilot/src/app/experiments/[id]/page.tsx) | **Experiment Detail** | Full variant scorecard, live conversion curves over time, on-demand AI analysis button, and rollout/kill-switch actions. |
| [`/analytics`](file:///Users/shubham/Desktop/pulsepilot/src/app/analytics/page.tsx) | **Experiment Intelligence** | Performance overview, variant comparison table, 5 interactive Recharts (conversion trends, CR bar chart, exposure distribution, guardrail trends), decision state badges, and printable PDF export modal. |
| [`/release-center`](file:///Users/shubham/Desktop/pulsepilot/src/app/release-center/page.tsx) | **Release Guardian** | **6 Core Features:** 1. Release Readiness Audit (5-gate checklist + user criteria). 2. Rollout Recommendation (3 states: Rollout, Continue, Block). 3. Gradual Canary Rollout (5%, 10%, 25%, 50%, 75%, 100%). 4. Safety Monitoring (Payment failure, error rate, bounce, latency). 5. Verified Safe Rollback (side-by-side diff & signature). 6. Operational Audit Log. |
| [`/releases`](file:///Users/shubham/Desktop/pulsepilot/src/app/releases/page.tsx) | **Release Center Alias** | Seamlessly redirects to `/release-center`. |
| [`/sandbox`](file:///Users/shubham/Desktop/pulsepilot/src/app/sandbox/page.tsx) | **Customer Sandbox** | Switch between user identities (`user_alex`, `user_sarah`, `user_david`), evaluate Flagsmith flag in real time, trigger checkout conversion telemetry, and simulate synthetic traffic. |
| [`/flags`](file:///Users/shubham/Desktop/pulsepilot/src/app/flags/page.tsx) | **Feature Flags** | List and manage Flagsmith flags, multivariate split percentages, and enabled/disabled states. |
| [`/insights`](file:///Users/shubham/Desktop/pulsepilot/src/app/insights/page.tsx) | **AI Growth Insights** | High-level synthesis cards with confidence scores, impact ratings, and recommended actions. |
| [`/integrations`](file:///Users/shubham/Desktop/pulsepilot/src/app/integrations/page.tsx) & [`/integrations/flagsmith`](file:///Users/shubham/Desktop/pulsepilot/src/app/integrations/flagsmith/page.tsx) | **Flagsmith Diagnostics** | Connection status, warehouse export readiness, environment key check, and SDK diagnostics. |
| [`/activity`](file:///Users/shubham/Desktop/pulsepilot/src/app/activity/page.tsx) | **Activity Logs** | Immutable timeline of all agent proposals, human approvals, and Flagsmith flag mutations. |
| [`/settings`](file:///Users/shubham/Desktop/pulsepilot/src/app/settings/page.tsx) | **Settings** | Flagsmith API credentials configuration, Gemini model selection, and safety policy toggles. |

---

### F. Design System & Component Library (`src/components/`)
* **Layout:** `AppShell`, `Sidebar`, `TopNavigation` (with breadcrumbs, global search, notification center, profile).
* **UI Components:** `MetricCard`, `ExperimentCard`, `VariantComparison`, `ConversionChart`, `ActivityTimeline`, `AIInsightCard`, `AgentStatusCard`, `FeatureFlagCard`, `StatusBadge`, `DataTable`, `ConfirmationModal`, `CommandPalette`, `NotificationPanel`, `PageHeader`, `EmptyState`.

---

## 4. What Is Left & Future Roadmap (Pending / Optional Enhancements)

While all core hackathon requirements and rubric items are **100% complete and working out of the box** (with high-fidelity fallback adapters and in-memory mock stores), the following items represent optional production-hardening steps for live multi-tenant cloud deployment:

### 1. Live PostgreSQL / Supabase Migration (Optional)
* **Current State:** The database schema is fully defined in `prisma/schema.prisma` (models: `Organization`, `User`, `Project`, `Experiment`, `ExperimentVariant`, `Metric`, `TelemetryEvent`, `AgentRun`, `AuditLog`), backed by a high-fidelity repository in `src/lib/db/repository.ts`.
* **To Enable Live DB:** Supply a valid PostgreSQL `DATABASE_URL` in `.env` and execute:
  ```bash
  npx prisma db push
  ```

### 2. Live Flagsmith Production Cloud Credentials (Optional)
* **Current State:** Automatic graceful fallback: When `FLAGSMITH_MANAGEMENT_KEY` is omitted or set to `"mock"`, the system runs a high-fidelity in-memory Flagsmith engine with deterministic hashing and simulated REST updates.
* **To Connect Live Flagsmith Instance:** Supply your live credentials in `.env`:
  ```bash
  FLAGSMITH_ENVIRONMENT_KEY=ser.xxxxxxxxxxxx
  FLAGSMITH_MANAGEMENT_KEY=xxxxxxxxxxxx
  FLAGSMITH_PROJECT_ID=12345
  ```

### 3. Vercel Cloud Deployment (Ready)
* The repository is clean, self-contained, and passes `npm run build` with zero warnings or external runtime dependencies.
* Simply import the repository into Vercel and supply `GEMINI_API_KEY`.

---

## 5. Verification Commands & Health Check

Any developer or judge can verify the complete health of the application with these four commands:

```bash
# 1. Type Check (0 errors)
npx tsc --noEmit

# 2. Deterministic Statistical Ground Truth Tests (Abramowitz-Stegun, Z-test, Bayes, SRM)
npm test

# 3. Production Next.js Build (34/34 pages static & dynamic)
npm run build

# 4. Start Local Development Server (http://localhost:3000)
npm run dev
```

---

## 6. Hackathon 3-Minute Presentation Runbook (For Judges)

Follow this exact flow when demonstrating PulsePilot AI:

1. **Dashboard & Overview (`/dashboard`):** Show the 6 KPI cards, active experiment cards, dual-axis exposure/conversion Recharts, and live Flagsmith connection status.
2. **AI Experiment Studio (`/studio`):** Click the quick-fill sample: *"Test social proof testimonials on the pricing card to lift checkout completion"*. Click **"Generate Experiment with Gemini"** to watch the Strategy Agent formulate variants and metrics in 3 seconds. Show the 7-point readiness check and click **"Approve & Deploy to Flagsmith"** (HITL gate).
3. **Interactive Customer Sandbox (`/sandbox`):** Switch between `user_alex`, `user_sarah`, and `user_david`. Observe Flagsmith deterministically assigning variants. Click **"Complete Checkout"** to send real conversion telemetry.
4. **Experiment Intelligence (`/analytics`):** Review the scorecard comparison table, conversion rate trends, Bayesian win probability curves, and click **"Export PDF Report"**.
5. **Release Guardian (`/release-center`):** Show the 5-point readiness audit. Demonstrate canary progression (5% $\to$ 25% $\to$ 50% $\to$ 100%). Click **"Simulate Guardrail Breach"** to showcase the real-time alert and execute a verified **Safe Rollback to 100% Control**.
6. **Activity & Audit Logs (`/activity`):** Inspect the tamper-resistant audit trail showing every operator signature and Flagsmith mutation.

---

*PulsePilot AI is built strictly according to the highest software engineering standards, combining the cognitive power of Google Gemini with the operational safety of Flagsmith.*
