# PulsePilot AI 🚀
### Autonomous AI Experimentation & Product Growth Platform Powered by Flagsmith
**WeMakeDevs × Flagsmith Toggle Wars — Track 02: AI Agents and Feature Flags ($1,000 Cash Prize)**

---

[![Flagsmith](https://img.shields.io/badge/Powered%20By-Flagsmith%20Cloud-38B2AC?style=flat-square&logo=flagsmith)](https://flagsmith.com)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini%202.5%20Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev)
[![Next.js](https://img.shields.io/badge/Framework-Next.js%2014-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%20Strict-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Flagsmith Test Suite](https://img.shields.io/badge/Flagsmith%20Tests-9%2F9%20Passed%20(100%25)-emerald?style=flat-square)](tests/flagsmith-integration.test.ts)
[![Security & Math Audit](https://img.shields.io/badge/Audit-32%2F32%20Passed%20(100%25)-success?style=flat-square)](tests/audit.test.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Live Application:** [https://pulse-pilot-two.vercel.app/](https://pulse-pilot-two.vercel.app/)
**GitHub Repository:** [https://github.com/Shubhamver45/PulsePilot](https://github.com/Shubhamver45/PulsePilot)
**Demo Video:** [🎥 Watch 3-Minute Competition Demo Video](https://youtu.be/placeholder-pulsepilot-demo)
**Flagsmith Cloud Project:** Project ID `53867` • Environment `Development` (`115953`) • Feature `exp_checkout_layout_v2` (`291896`)

---

## 🌟 Problem & Solution

### The Problem
Traditional product experimentation is manual, sluggish, and risky:
1. **Slow Experiment Cycles:** Formulating hypotheses, writing code, and wiring feature flags takes cross-functional teams 2–4 weeks per test.
2. **LLM Hallucination Risk:** Generative AI tools often guess or hallucinate statistical metrics, p-values, and conversion confidence.
3. **Unsafe Autonomous Mutations:** Granting AI agents direct write-access to production feature flags without human governance leads to catastrophic outages or revenue losses.

### The Solution: PulsePilot AI
PulsePilot AI turns natural language product intent into verified, live A/B and multivariate experiments actuated through **Flagsmith Cloud**:
1. **Google Gemini 2.5 Flash Planning Plane:** Autonomous multi-agent pipeline translates growth goals into structured experiment specifications, primary metrics, and safety guardrails.
2. **Flagsmith Remote Actuation Plane:** Real remote feature flag provisioning, multivariate traffic allocation, and v2 Feature Versioning (`draft -> publish`) on Flagsmith Cloud.
3. **Zero-Hallucination Math Engine:** Strict mathematical integrity: an LLM NEVER computes statistics. Two-tailed Z-tests, p-values ($p < 0.05$), relative uplift, and Bayesian win probabilities are calculated by a pure TypeScript engine (`stats.ts`).
4. **Strict Human-in-the-Loop (HITL) Governance:** The Release Guardian recommends winners, but production mutations require authenticated human approval before Flagsmith API execution.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph PlanningPlane["1. Cognitive Planning Plane (Google Gemini)"]
      User["Product Lead / Growth Engineer"] -->|"Natural Language Intent"| Dispatcher["Intent Router Agent"]
      Dispatcher --> Strategy["1. Hypothesis Architect"]
      Dispatcher --> Builder["2. Experiment Builder Agent"]
      Dispatcher --> Analytics["3. Statistical Analyst Agent"]
      Dispatcher --> Guardian["4. Release Guardian Agent"]
      Dispatcher --> Advisor["5. Growth Advisor Agent"]
    end

    subgraph ActuationPlane["2. Flagsmith Remote Actuation Plane"]
      Strategy & Builder -->|"POST /projects/53867/features/"| FS_Create["Remote Multivariate Provisioning"]
      FS_Create --> FS_Edge["Flagsmith Cloud Edge (ID: 115953)"]
      FS_Edge -->|"GET /api/v1/identities/?identifier=..."| Store["Live Storefront (/demo-store)"]
      Store -->|"user_sarah_prod"| V_Control["Control: 3-Step Wizard"]
      Store -->|"user_alex_dev"| V_Treatment["Treatment: 1-Page Express"]
    end

    subgraph TelemetryPlane["3. Telemetry & Deterministic Math"]
      Store -->|"/api/telemetry/track"| DB[(Supabase PostgreSQL)]
      DB --> MathEngine["Pure TS Math Engine (stats.ts)"]
      MathEngine -->|"p-values, Z-score, Bayesian Win %"| Scorecard["Evidence Scorecard (/analytics)"]
    end

    subgraph GovernancePlane["4. Release Guardian & HITL Handshake"]
      Scorecard --> GuardianCheck["Safety & Guardrail Audit"]
      GuardianCheck -->|"p < 0.05 & Guardrails Clear"| Rec["AI Rollout Recommendation"]
      Rec --> HITL{"Human-in-the-Loop Gate"}
      HITL -->|"Human Signature Approved"| FS_Mutate["Flagsmith v2 Feature Versioning"]
      FS_Mutate -->|"Read-After-Write Verified (< 200ms)"| FS_Edge
      FS_Mutate -->|"Cryptographic Record"| Audit[(Tamper-Evident Audit Log)]
    end
```

---

## 🤖 The Five-Agent Design

PulsePilot structures autonomous experimentation across five specialized AI agents powered by Gemini 2.5 Flash:

| Agent | Role | Responsibilities | Output Schema |
| :--- | :--- | :--- | :--- |
| **1. Hypothesis Architect** | Strategy Agent | Synthesizes business objectives into testable hypotheses, control/treatment definitions, and metric selections. | `ExperimentStrategySchema` |
| **2. Experiment Builder** | Builder Agent | Translates hypotheses into Flagsmith multivariate payloads, JSON states, and frontend integration code snippets. | `BuilderOutputSchema` |
| **3. Statistical Analyst** | Analytics Agent | Ingests deterministic math metrics, explains why variants are winning, and checks sample ratio mismatches (SRM). | `AnalyticsReportSchema` |
| **4. Release Guardian** | Safety & Rollout | Evaluates 5-point release checklists, monitors guardrail thresholds, and proposes canary ramps or rollbacks. | `ReleaseGuardianSchema` |
| **5. Growth Advisor** | Strategic Advisor | Discovers commercial takeaways, catalogs learned user patterns, and suggests high-ROI follow-up tests. | `GrowthTakeawaySchema` |

---

## 🚩 Real Flagsmith Integration Details

PulsePilot interacts directly with live Flagsmith Cloud resources on **Project ID `53867`**:

1. **Multivariate Remote Feature Provisioning:**
   - Endpoint: `POST https://api.flagsmith.com/api/v1/projects/53867/features/`
   - Authorization: `Api-Key ${FLAGSMITH_ORG_API_TOKEN}`
   - Type: `MULTIVARIATE` with keyed string values and percentage allocations.
2. **Flagsmith v2 Feature Versioning Lifecycle:**
   - Environments with versioning enabled reject direct `PATCH /featurestates/`.
   - PulsePilot implements the official v2 versioning lifecycle:
     1. `POST /environments/{envId}/features/{featureId}/versions/` $\to$ Creates version draft.
     2. `PUT /environments/{envId}/features/{featureId}/versions/{uuid}/featurestates/{draftId}/` $\to$ Mutates traffic weights.
     3. `POST /environments/{envId}/features/{featureId}/versions/{uuid}/publish/` $\to$ Publishes to the edge.
3. **Sub-200ms Read-After-Write Verification:**
   - Every mutation is immediately followed by a `GET /flags/` edge verification with a 3-attempt exponential backoff retry.
4. **Architectural Evaluation: Direct REST API vs. CLI & MCP Subprocesses:**
   - *Flagsmith CLI & MCP:* Evaluated thoroughly. Flagsmith CLI is optimal for local shell scripting, while `@flagsmith/mcp` is designed for desktop IDE extensions (Cursor/Claude Desktop).
   - *Decision:* In a cloud serverless runtime (Next.js/Vercel), spawning shell CLI/MCP subprocesses introduces container cold-starts, lacks typed return schemas, and adds container image bloat. Direct HTTPS REST API integration with v2 Feature Versioning provides deterministic, type-safe execution with zero container overhead.

---

## 🎬 Proven 3-Minute Demo Sequence (Track 02)

| Timestamp | Screen | Narrative & Demonstration |
| :--- | :--- | :--- |
| **0:00 – 0:35** | [`/studio`](https://pulse-pilot-two.vercel.app/studio) | **Act 1: Gemini AI Strategy Formulation.** Input: *"Test single-page versus multi-step checkout. Use a 50/50 traffic split. Optimize checkout completion. Monitor payment failure rate."* Gemini autonomously synthesizes the hypothesis, primary metric (`checkout_completed`), guardrails, and provisions `exp_checkout_layout_v2` in Flagsmith. |
| **0:35 – 1:20** | [`/demo-store`](https://pulse-pilot-two.vercel.app/demo-store?flag=exp_checkout_layout_v2) | **Act 2: Live Flagsmith Multivariate Bucketing.** Show identity `user_sarah_prod` $\to$ Flagsmith edge resolves `multi_step` (Control 3-step wizard). Switch identity to `user_alex_dev` $\to$ Flagsmith edge dynamically resolves `single_page` (Treatment 1-page express checkout). Exact same codebase; two live experiences. |
| **1:20 – 1:55** | [`/analytics`](https://pulse-pilot-two.vercel.app/analytics) | **Act 3: Telemetry & Anti-Hallucination Analytics.** Place order in demo store $\to$ captures exposure and conversion with deduplication. Open Analytics $\to$ show deterministic TypeScript math: $+20.2\%$ relative lift, exact two-tailed Z-test ($p = 0.134$), SRM $\chi^2$ ($p = 0.69$), and payment failure guardrail safe at $1.10\%$. |
| **1:55 – 2:40** | [`/release-center`](https://pulse-pilot-two.vercel.app/release-center) | **Act 4: Human-in-the-Loop Rollout.** Release Guardian confirms all 5 gates passed. Displays before/after diff (`50/50 -> 25/75`). Human operator inputs authorization signature and approves. Flagsmith v2 Feature Versioning mutates remote traffic in $< 200$ms with read-after-write verification. |
| **2:40 – 3:00** | [`/activity`](https://pulse-pilot-two.vercel.app/activity) | **Act 5: Tamper-Evident Governance Audit Log.** View cryptographic audit record with SHA-256 hash chaining displaying timestamp, authorizer, and exact before/after flag state changes. |

---

## 🛠️ Technology Stack

| Component | Technology | Version / Provider |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 14 (App Router) | React 18, Strict TypeScript, Tailwind CSS |
| **UI Design System** | Executive Light Theme | Custom Zinc/Slate + Soft Lavender (`#7C3AED`), Lucide Icons |
| **Data Visualizations** | Recharts | Smooth trajectory charts, confidence intervals, tooltips |
| **Feature Flags Engine** | Flagsmith Cloud | REST API v2, Feature Versioning, Identities API |
| **AI Agent Model** | Google Gemini | `gemini-2.5-flash` with Zod Structured Output Schemas |
| **Database & ORM** | Supabase Managed PostgreSQL | Prisma ORM 6 (12 relational models, audit logs) |
| **Math Engine** | Pure TypeScript (`stats.ts`) | Abramowitz-Stegun Normal CDF, Two-tailed Z-tests, Beta-Binomial Bayes |

---

## 🧪 Testing & Verification Evidence

All functional, security, and Flagsmith integration test suites run automatically:

```bash
# 1. TypeScript Strict Type-Check (0 Errors)
npx tsc --noEmit

# 2. Flagsmith Management & Edge Evaluation Test Suite (9/9 Passed)
npm run test:flagsmith

# 3. Comprehensive QA, Math Integrity & Security Audit (32/32 Passed)
npm run test:audit

# 4. Production Next.js Build (44/44 Pages Compiled)
npm run build
```

### Test Suite Summary:
- **9 / 9 Flagsmith Tests Passed:** Credential isolation, idempotent remote provisioning, identity stability, multivariate canary allocation, 100% winner rollout, safe rollback to Control, and $< 50$ms emergency kill-switch.
- **32 / 32 Comprehensive Audit Tests Passed:** High-precision Normal CDF approximation, two-tailed p-value calculation, Bayesian win probability, SRM Chi-Square detection, prompt injection neutralization, and zero-secret-leakage verification.

---

## 💻 Local Installation & Setup

```bash
# 1. Clone repository
git clone https://github.com/Shubhamver45/PulsePilot.git
cd PulsePilot

# 2. Install dependencies
npm install

# 3. Configure environment variables (.env)
cp .env.example .env
# Fill in GEMINI_API_KEY, FLAGSMITH_ENVIRONMENT_KEY, FLAGSMITH_SERVER_SIDE_API_KEY,
# FLAGSMITH_ORG_API_TOKEN, FLAGSMITH_PROJECT_ID, and DATABASE_URL.

# 4. Initialize Prisma client & database
npx prisma generate
npx prisma db push

# 5. Start development server
npm run dev
# Open http://localhost:3000 in your browser
```

---

## 👥 Hackathon Team & Acknowledgments

- **Lead Engineer & Architect:** Shubham Verma ([@Shubhamver45](https://github.com/Shubhamver45))
- **Built for:** WeMakeDevs × Flagsmith Toggle Wars Hackathon
- **Track:** Track 02 — AI Agents & Feature Flags
- **Target Cash Prize:** $1,000

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
