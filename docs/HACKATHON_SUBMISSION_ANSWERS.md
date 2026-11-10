# PulsePilot AI — Official Hackathon Submission Package
## Flagsmith Toggle Wars — Track 02: AI Agents & Feature Flags

---

### 1. Basic Project Info
- **Project Name:** PulsePilot AI
- **Tagline:** Autonomous AI Experimentation & Product Growth Platform powered by Flagsmith & Google Gemini
- **Hackathon Track:** Track 02: AI Agents and Feature Flags
- **GitHub Repository:** [https://github.com/Shubhamver45/PulsePilot](https://github.com/Shubhamver45/PulsePilot)
- **Live Demo App:** `http://localhost:3000` (Local) / Vercel Production Deployment
- **Documentation Hub:** [https://github.com/Shubhamver45/PulsePilot/tree/main/docs](https://github.com/Shubhamver45/PulsePilot/tree/main/docs)

---

### 2. Inspiration
Modern product and engineering teams want to run high-velocity experimentation. But in practice, experimentation is bogged down by severe execution friction:
1. **Formulation Latency:** Growth ideas stay trapped in PRDs and Jira backlogs for weeks before reaching a developer.
2. **Implementation Friction:** Developers spend hours wiring up multivariate flag configurations, SDK evaluations, and telemetry schemas.
3. **Statistical Risk & AI Hallucination:** Product managers misinterpret sample noise as signal, or rely on LLMs that hallucinate arithmetic, p-values, and conversion rates.
4. **Rollout Paralysis:** 82% of winning experiments stall before 100% rollout due to fear of breaking production. Rollbacks are manual, slow, and lack cryptographic audit trails.

We asked ourselves: **What if an autonomous AI co-pilot could handle the entire experimentation lifecycle—from natural language intuition to live Flagsmith multivariate flags, factual statistical analysis, and safe canary rollouts—while keeping an authenticated human strictly in control?**

That vision is **PulsePilot AI**.

---

### 3. What It Does
PulsePilot AI is an autonomous experimentation and product growth platform that operates across three core planes:

#### A. Cognitive Planning Plane (Google Gemini 2.5 Flash Swarm)
- **Strategy Agent:** Translates product objectives (e.g. *"Reduce mobile checkout abandonment"*) into structured hypotheses, variant definitions, and primary/guardrail metric trees.
- **Experiment Builder Agent:** Validates traffic allocations, generates exact Flagsmith multivariate JSON payloads, and validates telemetry event requirements.
- **Analytics Agent:** Ingests factual Flagsmith results and synthesizes executive business intelligence, identifying anomalies and recommending subsequent actions.
- **Release Guardian Agent:** Evaluates release readiness across a 5-point matrix, structures gradual canary rollout stages (5% $\to$ 25% $\to$ 100%), and monitors error thresholds.
- **Growth Advisor Agent:** Aggregates cross-experiment institutional learnings to prioritize iterative experimentation backlogs.

#### B. Actuation & Experimentation Plane (Flagsmith Cloud)
- **Multivariate Feature Delivery:** Dynamic JSON feature states (`layout: "single-page"`, `express_checkout: true`) evaluated directly by client SDKs without redeployment.
- **MurmurHash3 Determinism:** Guarantees stable identity mapping across sessions with zero UI flicker.
- **Server-Side REST Management API:** Programmatically provisions feature flags, updates traffic allocations, and triggers emergency rollbacks.
- **Real-Time Telemetry Tracking:** Correlates `EXPOSURE` and `CONVERSION` events using stable distinct user identities.

#### C. Deterministic Core & Safety Plane
- **Zero-Hallucination Math Engine:** Pure TypeScript analytics engine computing two-sample Z-scores, normal CDF, two-tailed p-values, Bayesian Beta-Binomial win probabilities, and Sample Ratio Mismatch (SRM) Chi-Square tests.
- **Strict Human-in-the-Loop (HITL) Gate:** Autonomous agents propose configurations, but can *never* actuate a live production flag mutation or rollout without an authenticated human approval recorded with an immutable cryptographic audit signature.
- **Instant Kill-Switch:** Reverts live production traffic to 100% Control in under 50ms when guardrail metrics spike.

---

### 4. How We Built It
- **Frontend & UX:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Lucide Icons, and Recharts. Designed with a custom, executive-grade light theme (crisp whites, soft slates, and violet/lavender accents inspired by Linear and Stripe).
- **Backend & APIs:** 14 Next.js server-side route handlers validating all incoming and outgoing payloads through Zod schemas.
- **Experimentation Engine:** Flagsmith Client SDK (`@flagsmith/flagsmith`) and Flagsmith REST Management API.
- **AI Integration:** Google Gemini 2.5 Flash (`@google/generative-ai`) utilizing strict structured JSON output mode, prompt injection filtering, and automated secret leakage interception.
- **Database & State:** Supabase Managed PostgreSQL with Prisma ORM (12 relational models: `Organization`, `User`, `Project`, `Experiment`, `ExperimentVariant`, `Metric`, `TelemetryEvent`, `AuditLog`, `AgentRun`, etc.).
- **Interactive Customer Demo:** Built-in **PulsePilot Demo Store (`/demo-store`)** simulating a hardware e-commerce store with live Flagsmith `checkout_experience` multivariate variations and an interactive synthetic traffic simulator.

---

### 5. Challenges We Ran Into
1. **Preventing AI Math Hallucination:** LLMs naturally struggle with complex cumulative distribution functions and Bayesian posteriors. We solved this by architecting a strict policy: **the LLM is prohibited from calculating math**. All conversion rates, Z-scores, and p-values are computed by a deterministic TypeScript engine and fed to Gemini as factual ground truths.
2. **Stable Telemetry Attribution:** In high-velocity client experiments, race conditions often lead to false-positive conversions. We solved this by ensuring that `EXPOSURE` and `CONVERSION` telemetry strictly share the identical `distinctUserId` hashed via Flagsmith's MurmurHash3 algorithm.
3. **Safe Autonomous Actuation:** Allowing an AI to modify production feature flags is catastrophic if unconstrained. We solved this by introducing an authenticated **Human-in-the-Loop (HITL) cryptographic approval gate**: the Builder Agent drafts the Flagsmith payload, but only an authenticated human with RBAC permissions can commit the change to production Flagsmith flags.

---

### 6. Accomplishments That We're Proud Of
- **Zero Arithmetic Hallucination:** 10/10 mathematical unit tests pass, validating normal CDF ground truths, Z-scores, and Bayesian win rates.
- **Comprehensive 27-Point Security Audit:** 27/27 automated test suites passing across RBAC isolation, prompt injection defenses, zero secret leakage, Flagsmith canary actuation, and tamper-resistant audit trails.
- **Full Closed-Loop Implementation:** PulsePilot is not a mockup—it talks to live Google Gemini 2.5 Flash, live Flagsmith Cloud (Project `53867`), and live Supabase PostgreSQL.
- **Release Guardian:** An automated safety net that allows teams to advance canary rollouts safely and roll back instantly with one click.

---

### 7. What We Learned
- **Feature Flags are the Ideal Safety Boundary for AI Agents:** Giving AI agents direct access to source code or production infrastructure is risky. Feature flags provide a deterministic, measurable, and instantly reversible actuation plane for autonomous agents.
- **Multivariate Feature Payloads Unlock No-Code Experimentation:** Storing structured JSON payloads inside Flagsmith feature states allows teams to test fundamentally different user flows (e.g. multi-step vs single-page vs express checkout) without frontend code releases.

---

### 8. What's Next for PulsePilot AI
1. **Flagsmith Model Context Protocol (MCP) Server Integration:** Enable developers to inspect and actuate Flagsmith experiments directly from Cursor, Claude Desktop, and Gemini CLI.
2. **Multi-Armed Bandit (MAB) Dynamic Shifting:** Implement continuous Bayesian traffic routing to dynamically steer traffic toward winning variations in real time while preserving statistical validity.
3. **Automated GitHub Pull Request Generator:** When a rollout reaches 100%, the AI automatically opens a GitHub PR to clean up the feature flag and hardcode the winning variant.

---

### 9. Built With
- **Flagsmith Cloud** (Client SDK, Edge Evaluation, REST Management API)
- **Google Gemini 2.5 Flash** (Structured JSON Multi-Agent Reasoning)
- **Next.js 14** (App Router, Server Route Handlers)
- **TypeScript Strict**
- **Supabase** (Managed PostgreSQL, JWT Authentication)
- **Prisma ORM** (12 Relational Data Models)
- **Tailwind CSS & Recharts**
- **Zod** (End-to-End Type Validation & Anti-Leakage Sanitation)

---

*Verified against PulsePilot AI codebase and Flagsmith Toggle Wars Track 02 specifications.*
