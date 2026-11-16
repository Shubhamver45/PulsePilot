# 🏆 PulsePilot AI — Hackathon Submission Package
**Competition:** WeMakeDevs × Flagsmith Toggle Wars  
**Track:** Track 02 — AI Agents & Feature Flags ($1,000 Cash Prize)  
**Live URL:** [https://pulse-pilot-two.vercel.app/](https://pulse-pilot-two.vercel.app/)  
**Preview URL:** [https://pulse-pilot-two-git-staging-shubhamver45s-projects.vercel.app/](https://pulse-pilot-two-git-staging-shubhamver45s-projects.vercel.app/)  
**GitHub Repository:** [https://github.com/Shubhamver45/PulsePilot](https://github.com/Shubhamver45/PulsePilot)  
**Branch:** `main`

---

## 📋 Quick Form Fields (Ready to Copy & Paste)

### 1. Project Title
```text
PulsePilot AI — Autonomous Experimentation & Product Growth Platform Powered by Flagsmith
```

### 2. Tagline (Under 100 characters)
```text
Autonomous AI experimentation & growth engine powered by Google Gemini and Flagsmith Cloud.
```

### 3. Track Selection
```text
Track 02 — AI Agents & Feature Flags
```

### 4. Links
- **Live Demo Application:** `https://pulse-pilot-two.vercel.app/`
- **GitHub Repository:** `https://github.com/Shubhamver45/PulsePilot`
- **Demo Video:** `[INSERT YOUR YOUTUBE OR LOOM URL HERE]`
- **Flagsmith Showcase Route:** `https://pulse-pilot-two.vercel.app/integrations/flagsmith`
- **Interactive Storefront Route:** `https://pulse-pilot-two.vercel.app/demo-store`
- **Analytics Scorecard Route:** `https://pulse-pilot-two.vercel.app/analytics`

---

## 🌟 Detailed Project Story (For Devpost / Form Fields)

### 💡 Inspiration
Running product experiments today is fragmented, slow, and risky. Growth engineers and product managers spend 2–4 weeks per experiment manually writing code, configuring feature flags, debating statistical significance, and hesitating to roll out winning features for fear of breaking production. Meanwhile, typical generative AI tools often hallucinate conversion rates or rush into false-positive releases.

We asked: **What if an autonomous AI agent swarm could handle the entire experimentation lifecycle—from natural language growth ideas to remote Flagsmith flag provisioning, rigorous zero-hallucination math, and human-approved canary rollouts?**

That vision is **PulsePilot AI**.

---

### 🚀 What It Does
PulsePilot AI bridges the gap between natural language product intent and live production feature flags:

1. **Natural Language to Flagsmith Provisioning:** In the Experiment Studio, teams describe a business problem (e.g., *"Streamline checkout flow from 3-step wizard to 1-page express to reduce 35% cart abandonment"*). Google Gemini 2.5 Flash autonomously formulates hypotheses, chooses primary metrics and safety guardrails, and structures multivariate Flagsmith flags.
2. **Strict Human-in-the-Loop (HITL) Policy:** Autonomous agents are strictly gated. No production flag can be created, mutated, or rolled out without an authenticated human signature.
3. **Real Remote Flagsmith Actuation:** Flags are provisioned and mutated directly on Flagsmith Cloud using official **v2 Feature Versioning** (`POST /versions/` $\to$ `PUT /featurestates/` $\to$ `POST /publish/`) with sub-160ms edge latency and read-after-write verification.
4. **Live Storefront with Deterministic Identity Bucketing:** In the PulsePilot Demo Store, different user identities deterministically receive different experiences (e.g., Elena gets a 3-Step Wizard; Alex gets a 1-Page Express Checkout) with zero UI flicker and live attribution.
5. **Zero-Hallucination Statistical Integrity:** An LLM is NEVER allowed to compute statistics. A pure TypeScript math engine executes two-proportion Z-tests ($Z = 1.50, p = 0.134$), normal CDF approximations, Beta-Binomial Bayesian win probabilities ($93.3\%$), and Sample Ratio Mismatch (SRM) Chi-Square tests ($\chi^2 = 0.1593, p = 0.690$). The AI ingests these pre-computed numbers as factual ground truth.
6. **Release Guardian & Safe Rollback:** Evaluates a 5-point release readiness matrix, manages gradual canary progressions (5% $\to$ 50% $\to$ 100%), and provides instant $<50$ms 1-click safe rollbacks if guardrail metrics degrade.
7. **Tamper-Evident Distributed Audit Trail:** Every flag creation, mutation, and rollout is permanently recorded with SHA-256 hash chaining under PostgreSQL transaction-scoped advisory locks, guaranteeing gapless sequence numbers and verifiable immutability across distributed serverless runtimes.

---

### 🚩 How We Used Flagsmith (Track 02 Core Criteria)
PulsePilot is built deeply around Flagsmith Cloud:
- **Target Project:** Project ID `53867`
- **Environment:** `Development` (Environment ID `115953`)
- **Active Experiment Flag:** `exp_checkout_layout_v2` (Feature ID `291896`)
- **Multivariate Payload Delivery:** We store structured JSON configurations inside Flagsmith feature values (`{"layout": "multi_step"}` vs `{"layout": "single_page"}`) enabling zero-downtime UI updates without redeploying frontend code.
- **Flagsmith v2 Feature Versioning:** We implement the official Flagsmith v2 draft-and-publish versioning lifecycle for atomic, conflict-free production updates.
- **Identity Traits & Server-Side Trait Persistence:** Genuine server-side Flagsmith trait management via `POST /api/v1/identities/` with server key (`plan`, `beta_tester`, `device`) for distinct personas.
- **Live Project Segment Targeting:** Created and verified Flagsmith project segment **Beta Testers** (ID `1197309`, rule `beta_tester EQUAL true`) with real-time membership calculation.
- **Deterministic Identity Evaluation:** Flagsmith’s edge identities API guarantees that visitors consistently see the exact same variation across visits.
- **Architectural Rationale (Direct REST vs CLI/MCP):** PulsePilot operates as a serverless agent orchestrator on Vercel. Spawning shell CLI/MCP subprocesses adds cold-starts and lacks typed return validation. Direct HTTPS REST integration with v2 Feature Versioning provides deterministic, type-safe execution under 160ms.

---

### 🛠️ How We Built It
- **Frontend:** Next.js 14 App Router, React 18, Strict TypeScript, Tailwind CSS (Executive Light Theme with Lavender/Violet accents), Recharts.
- **AI Planning Layer:** Google Gemini 2.5 Flash with strict Zod structured output schemas.
- **Feature Flags Engine:** Flagsmith Cloud REST API (v2 Feature Versioning, Flags endpoint, Identities endpoint).
- **Database & ORM:** Supabase Managed PostgreSQL, Prisma ORM 6 with 12 relational models.
- **Deterministic Math Engine:** Pure TypeScript implementation of standard normal distributions, two-tailed Z-tests, and Beta-Binomial conjugate integration (`src/lib/analytics/stats.ts`).
- **Security & Integrity:** Input sanitization interceptor with zero secret leakage enforcement, SHA-256 cryptographic audit chaining with PostgreSQL transaction advisory locking, and production-versus-mock isolation guards.

---

### 🧗 Challenges We Overcame
1. **Serverless Flagsmith v2 Versioning:** Flagsmith environments with versioning enabled reject direct PATCH calls. We implemented the complete 3-step draft $\to$ mutate $\to$ publish lifecycle with automated exponential backoff retries.
2. **Preventing LLM Math Hallucinations:** Large language models notoriously invent plausible-sounding p-values and confidence intervals. We created a strict architectural boundary where stats are pre-computed in pure TypeScript before any AI prompt is constructed.
3. **Distributed Cryptographic Audit Concurrency:** On multi-instance serverless platforms like Vercel, concurrent requests can fork audit signatures. We implemented PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`) and recursive canonical JSON serialization to guarantee linear sequence numbers and deterministic hash verification.
4. **Production vs. Mock Isolation:** To prevent silent fallbacks during high-stakes rollouts, we implemented production guards that immediately return HTTP 503/502 if production credentials fail, strictly reserving mock adapters for offline test environments.

---

### 🏅 Accomplishments & Testing Verification
- **100% Test Suite Green Across All Systems:**
  - **23 / 23 Flagsmith Integration Tests Passed:** Live remote feature provisioning, deterministic identity stability, identity traits (`plan`, `beta_tester`, `device`), project segment targeting (Beta Testers ID `1197309`), multivariate canary allocation, 100% winner rollout, safe rollback to Control, emergency kill switch, and strict production-versus-mock isolation guards.
  - **Distributed Concurrency Verified (100 & 500 Concurrent Appends):** PostgreSQL transaction-level advisory locks (`pg_advisory_xact_lock`) guarantee linear SHA-256 hash chaining with unique, gapless sequence numbers across multiple independent serverless instances.
  - **Database Engine-Level Immutability:** Installed PostgreSQL trigger `trg_audit_log_immutable` blocking direct SQL `UPDATE` and `DELETE` operations at the engine level (`P0001`).
  - **Telemetry Deduplication & Ground Truth Attribution:** Mathematical first-touch attribution with conversion rates strictly bounded in $[0, 1]$, preventing repeat-purchase rate inflation.
  - **36 / 36 Comprehensive QA & Security Audit Tests Passed:** High-precision Normal CDF approximation, two-tailed p-value calculation, Bayesian win probability, SRM Chi-Square detection, prompt injection neutralization, and zero-secret-leakage verification.
  - **16 / 16 Staging Smoke Tests Passed:** Verified end-to-end operational flows across the live staging environment.
- **Live Cloud Actuation:** Verified sub-160ms remote mutations directly in Flagsmith Cloud.
- **Executive Polish:** High-contrast, responsive light theme adhering to modern design standards (Linear + Stripe + Vercel aesthetic).
