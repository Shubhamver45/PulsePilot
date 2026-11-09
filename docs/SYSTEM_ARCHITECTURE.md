# System Architecture Document
## PulsePilot AI — Autonomous Experimentation & Growth Platform
**Hackathon Track:** Flagsmith Toggle Wars — Track 02: AI Agents & Feature Flags  
**Author:** Principal Architect & Technical Lead  
**Status:** Approved Architecture Draft  
**Version:** 1.0.0  

---

## 1. High-Level Architecture Overview

PulsePilot AI employs a decoupled, modular architecture adhering to zero-trust principles for AI orchestration and feature flag control. The system separates user presentation, client-side flag evaluation, server-side business logic, deterministic mathematical analysis, and AI agent reasoning.

```mermaid
flowchart TD
    subgraph Client["Presentation Layer (Client Browser)"]
        UI["PulsePilot Dashboard\n(Next.js App Router + React + Tailwind)"]
        FS_Client["Flagsmith React Client SDK\n(Identity & Flag Evaluation)"]
        DemoApp["Interactive Sandbox\n(Live Experiment Surface)"]
    end

    subgraph Security["Security & Authentication Boundary"]
        SupabaseAuth["Supabase Auth\n(JWT Verification & Session Management)"]
        ZodValidator["Zod Input/Output\nValidation Layer"]
    end

    subgraph Server["Application & API Layer (Next.js Server-Side)"]
        APIRoutes["Next.js Server API Routes\n(/api/experiments, /api/agent, /api/telemetry)"]
        MathEngine["Deterministic Statistical Engine\n(Frequentist Z-Test & Bayesian Calculator)"]
        AuditService["Cryptographic Audit & Logging Service"]
    end

    subgraph Agents["AI Agent Orchestration Core"]
        GeminiCore["Google Gemini API\n(Structured JSON Engine)"]
        HypothesisAgent["Hypothesis Architect Agent"]
        AnalystAgent["Statistical Analyst Agent"]
        RolloutAgent["Rollout Strategist Agent"]
    end

    subgraph FlagsmithCloud["Flagsmith Cloud / Engine"]
        FS_API["Flagsmith Management REST API\n(Features, Segments, Multivariate)"]
        FS_Evaluator["Flagsmith Flag Engine\n(Real-Time Trait & Rule Matching)"]
    end

    subgraph DataStore["Data & Persistence Layer"]
        Prisma["Prisma ORM Client"]
        Postgres["PostgreSQL Database (Supabase)\n(Experiments, Telemetry, Audits)"]
    end

    %% Interactions
    UI -->|Session Auth| SupabaseAuth
    UI -->|API Requests| ZodValidator --> APIRoutes
    DemoApp -->|Get Variant| FS_Client
    FS_Client <-->|Evaluate Flags| FS_Evaluator

    APIRoutes --> Prisma --> Postgres
    APIRoutes --> MathEngine
    APIRoutes --> AuditService

    APIRoutes -->|Agent Prompt & Schema| GeminiCore
    GeminiCore --> HypothesisAgent & AnalystAgent & RolloutAgent

    APIRoutes -->|Provision Flags & Adjust Splits| FS_API
    DemoApp -->|Track Conversions| APIRoutes
```

---

## 2. Layered Component Architecture

### 2.1 Presentation Layer (Frontend)
- **Framework:** Next.js (App Router, Server Components where appropriate, Client Components for dynamic interactivity).
- **Styling & UI Kit:** Tailwind CSS with a tailored executive light theme palette, Radix UI primitives / shadcn/ui components, Lucide icons.
- **Data Visualization:** Recharts for Bayesian probability density curves, conversion rates over time, sample accumulation, and uplift confidence intervals.
- **State Management & Data Fetching:** SWR / React Query patterns with optimistic UI updates and instant cache invalidation upon flag actions.
- **Flagsmith React SDK:** Integrated with `FlagsmithProvider` for client-side flag retrieval and traits management.

### 2.2 Security & Authentication Boundary
- **User Authentication:** Supabase Auth handles email/password, magic links, or OAuth sessions via standard JWTs validated in Next.js middleware and route handlers.
- **Authorization & RBAC:** Organization-level and Project-level access controls (`Admin`, `Editor`, `Viewer`). Only `Admin` and `Editor` roles can approve AI-generated rollouts.
- **Secret Isolation:** Environment variables containing Flagsmith Management API Keys, Gemini API Keys, and Database credentials are strictly bound to server-side executions (`process.env.*` without `NEXT_PUBLIC_` prefixes).

### 2.3 Application & API Layer (Next.js Server-Side)
- **API Endpoints:**
  - `/api/experiments`: CRUD for experiments, status transitions, and variant definitions.
  - `/api/agent/formulate`: Triggers the Hypothesis Architect to generate an experiment structure from natural language.
  - `/api/agent/analyze`: Triggers the Statistical Analyst to evaluate current telemetry and generate insight summaries.
  - `/api/agent/recommend`: Triggers the Rollout Strategist to produce canary/winner rollout recommendations.
  - `/api/telemetry/track`: High-throughput ingestion of client exposure and conversion events.
  - `/api/flagsmith/sync`: Bi-directional synchronization with Flagsmith Management API.
  - `/api/audit-logs`: Immutable retrieval of system operations and human approvals.
- **Deterministic Statistical Engine:**
  - Written in TypeScript with zero LLM dependency.
  - Computes standard error ($SE$), Z-score, p-value, 95% Confidence Interval ($CI$), and Bayesian probability to beat control using numerical integration.
  - Outputs fed to agents as strict factual inputs.

### 2.4 AI Agent Orchestration Core
- Uses **Google Gemini** with native structured JSON output and schema enforcement via Zod.
- Agents operate under dedicated system prompts with role-based constraints:
  - **Hypothesis Architect:** Specializes in product psychology, conversion funnels, and feature flag taxonomy.
  - **Statistical Analyst:** Specializes in translating deterministic math into clear executive summaries and risk assessments.
  - **Rollout Strategist:** Specializes in safe deployment policies, progressive traffic ramp-ups (e.g., 5% $\to$ 25% $\to$ 50% $\to$ 100%), and canary safety guardrails.

### 2.5 Flagsmith Cloud Integration
- **Management API:**
  - Provisions feature flags: `FLAG_KEY_EXP_<NAME>`.
  - Sets up multivariate options (e.g., `control` = 50%, `variant_a` = 50%).
  - Configures feature values (JSON payloads containing UI copy, colors, button behaviors, or pricing numbers).
  - Toggles flag states (Enabled / Disabled / Archived).
- **Client SDK:**
  - Instantiated with `FlagsmithProvider` using the public `environmentID`.
  - Identifies users via distinct user keys and user traits (e.g., `plan: "pro"`, `country: "US"`).
  - Evaluates flag values synchronously with zero flicker.

### 2.6 Persistence & Telemetry Layer
- **PostgreSQL via Prisma ORM:**
  - Stores relational metadata: Users, Organizations, Projects, Experiments, Variants, Metrics, Events, Agent Runs, and Audit Logs.
  - Optimized indexes on `experimentId`, `timestamp`, `userId`, and `variantId` to support real-time aggregation queries.

---

## 3. End-to-End Sequence Flows

### 3.1 Natural Language Experiment Creation & Flag Provisioning

```mermaid
sequenceDiagram
    autonumber
    actor User as Product Manager
    participant UI as PulsePilot Dashboard
    participant API as Next.js API (/api/agent/formulate)
    participant AI as Gemini 1.5 Pro / Flash
    participant DB as PostgreSQL (Prisma)
    participant FS as Flagsmith Management API

    User->>UI: Enters natural language prompt
    UI->>API: POST /api/agent/formulate { prompt, projectId }
    API->>AI: Invoke Hypothesis Architect with strict Zod Schema
    AI-->>API: Returns Structured JSON (Title, Hypothesis, Variants, Flags)
    API->>DB: Save Experiment as DRAFT (Status: DRAFT)
    API-->>UI: Display Interactive Draft Experiment Card
    User->>UI: Reviews & clicks "Approve & Deploy to Flagsmith"
    UI->>API: POST /api/experiments/:id/deploy
    API->>FS: Create Feature Flag & Multivariate Options
    FS-->>API: Returns Flagsmith Feature ID & State
    API->>DB: Update Experiment (Status: ACTIVE, flagsmithFeatureId)
    API->>DB: Write Audit Log (ACTION: EXPERIMENT_PROVISIONED)
    API-->>UI: Experiment is now LIVE
```

### 3.2 Telemetry Tracking & Real-Time Statistical Evaluation

```mermaid
sequenceDiagram
    autonumber
    actor Visitor as End User / Sandbox
    participant Demo as Application Surface / Sandbox
    participant FS as Flagsmith Engine
    participant Telemetry as Telemetry API (/api/telemetry/track)
    participant DB as PostgreSQL (Prisma)
    participant Math as Deterministic Math Engine
    participant UI as PulsePilot Analytics View

    Visitor->>Demo: Interacts with page
    Demo->>FS: flagsmith.hasFeature('exp_checkout_flow')
    FS-->>Demo: Returns Variant ('social_proof_v1')
    Demo->>Telemetry: POST /api/telemetry/track (EXPOSURE)
    Telemetry->>DB: Record Exposure Event
    Visitor->>Demo: Completes Purchase (Conversion)
    Demo->>Telemetry: POST /api/telemetry/track (CONVERSION)
    Telemetry->>DB: Record Conversion Event
    UI->>DB: Poll / Fetch Aggregated Counts
    UI->>Math: Compute Z-Score, Uplift %, p-value, Bayesian Win Probability
    Math-->>UI: Return Verified Statistical Metrics
    UI-->>User: Render Real-Time Charts & Confidence Intervals
```

### 3.3 Safe Rollout & Human-in-the-Loop Safeguard

```mermaid
sequenceDiagram
    autonumber
    participant UI as PulsePilot Dashboard
    participant API as Next.js API (/api/agent/recommend)
    participant Math as Deterministic Math Engine
    participant AI as Gemini Rollout Strategist
    participant DB as PostgreSQL (Prisma)
    participant FS as Flagsmith Management API
    actor Human as Product / Engineering Lead

    UI->>API: Trigger Automated Rollout Analysis
    API->>Math: Fetch Verified Math (Sample Size, p-value, Guardrails)
    Math-->>API: Math Results (Confidence: 97.4%, Uplift: +14.2%)
    API->>AI: Generate Rollout Recommendation (Input: Verified Math)
    AI-->>API: Structured Recommendation (Action: ROLLOUT_WINNER, Variant: B)
    API->>DB: Store Recommendation in Pending State
    API-->>UI: Display "Rollout Recommendation Pending Approval"
    Human->>UI: Inspects rationale, checks guardrails & clicks "Approve Rollout"
    UI->>API: POST /api/experiments/:id/rollout { variantId: "variant_b" }
    API->>FS: Update Flagsmith Flag: Set Variant B to 100%, Disable Others
    FS-->>API: Success
    API->>DB: Update Experiment Status: CONCLUDED_ROLLED_OUT
    API->>DB: Write Immutable Audit Log (Approver, Timestamp, Diff)
    API-->>UI: Confirm Rollout Deployed to 100% of Users
```

---

## 4. Key Architectural Decisions & Rationale

1. **Why Pure Deterministic Math for Statistics instead of LLM calculation?**
   - *Rationale:* LLMs frequently suffer from arithmetic hallucination, inconsistent p-value rounding, and probabilistic extrapolation errors. By computing statistics through rigorously tested mathematical formulas and passing the resulting numbers to the LLM solely for qualitative analysis and narrative synthesis, we guarantee 100% mathematical integrity.

2. **Why Human-in-the-Loop for Flag Rollouts?**
   - *Rationale:* In enterprise and startup production environments, unattended automated code or flag switching can lead to cascading failures, billing anomalies, or unexpected user friction. Human approval guarantees engineering accountability while leveraging AI for heavy analytical lifting.

3. **Why Flagsmith as the Core Engine?**
   - *Rationale:* Flagsmith is the leading open-source feature flagging and remote config platform. Its separation of Management API vs Client SDK, multivariate evaluation engine, and segment overrides provide an enterprise-grade backbone for our AI agents to actuate changes safely.

