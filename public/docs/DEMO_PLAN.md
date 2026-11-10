# Hackathon Demo Plan & Presentation Guide
## PulsePilot AI — Autonomous Experimentation & Growth Platform
**Hackathon:** TOGGLE WARS — Flagsmith Experimentation Hackathon  
**Target Track:** Track 02: AI Agents and Feature Flags  
**Author:** Technical Lead & Principal Architect  
**Version:** 1.0.0  

---

## 1. Executive Demo Thesis

> **"Feature flags are the safest, most precise actuators for AI agents in production."**  
> Rather than letting AI modify code directly or leaving humans to manually juggle complex multivariate splits, **PulsePilot AI** unifies **Google Gemini** as the cognitive experiment architect and **Flagsmith** as the real-time execution engine.

---

## 2. 3-Minute Video Demo Script & Timing Breakdown

| Time | Scene | Visual | Spoken Talking Points |
|---|---|---|---|
| **0:00 - 0:25** | **The Problem & Vision** | High-level PulsePilot dashboard with sleek Linear/Vercel light theme styling. | *"Product teams know experimentation drives growth, but setting up hypotheses, multivariate flags, and interpreting Bayes vs frequentist confidence takes weeks. Welcome to PulsePilot AI: an autonomous experimentation co-pilot powered by Flagsmith and Gemini for Toggle Wars Track 2."* |
| **0:25 - 0:55** | **Natural Language Formulation** | Typing prompt: *"Test social proof vs annual discount badge on our SaaS pricing card to lift checkout completion"* $\to$ AI formulation in 3 seconds. | *"Watch Sarah, our product lead. She types a simple natural language growth goal. In seconds, our Gemini Hypothesis Architect generates an experiment hypothesis, identifies primary and guardrail metrics, and designs the exact multivariate feature flag payload."* |
| **0:55 - 1:25** | **Flagsmith Provisioning & HITL Gate** | Human clicks "Approve & Deploy to Flagsmith". Live Flagsmith badge turns green. | *"Notice our Human-in-the-Loop safeguard: the AI cannot deploy unreviewed flags to production. Sarah inspects the splits, clicks 'Approve', and PulsePilot provisions the multivariate feature directly in Flagsmith via the Management API."* |
| **1:25 - 2:05** | **Interactive Sandbox & Real Telemetry** | Switching to the Interactive Demo Sandbox. Toggling user identities, seeing variants render live via Flagsmith SDK, clicking conversion buttons. | *"Here is our live customer sandbox running the Flagsmith React SDK. As different users arrive, Flagsmith evaluates traits and serves the assigned variant. When users convert, telemetry streams back to PulsePilot. Real data—never synthetic traffic masquerading as real."* |
| **2:05 - 2:35** | **Deterministic Math & AI Analyst** | Real-time Recharts showing conversion rate curves, confidence intervals, and the AI Statistical Brief. | *"Look at our analytics engine. Statistics are computed deterministically in pure TypeScript—no arithmetic hallucinations. The Gemini Statistical Analyst explains the findings: Variant B shows a +18.4% uplift with 97.2% statistical confidence."* |
| **2:35 - 3:00** | **Safe Rollout & Emergency Kill Switch** | Rollout Strategist recommendation card appears. Clicking "Execute 100% Rollout". Demonstrating emergency kill switch. | *"Our Rollout Strategist recommends a 100% rollout. With one click, Flagsmith locks the winning variant across all traffic. And if anything ever goes wrong, an emergency kill switch reverts the flag instantly. Complete audit logs record every decision."* |

---

## 3. Step-by-Step Interactive Demo Walkthrough for Judges

Judges can explore PulsePilot AI live by following this exact 5-step journey:

### Step 1: Browse Existing Experiments
- Land on the **PulsePilot Dashboard** (`/`).
- Observe active experiments, overall conversion uplift, and live Flagsmith connection status.

### Step 2: Formulate a New Experiment
- Click **"New AI Experiment"** (`/experiments/new`).
- Click the quick-fill sample prompt:  
  `"Test a social proof testimonial vs a 20% annual discount badge on our checkout card to maximize subscription completion."`
- Click **"Generate Experiment with Gemini"**.
- Watch the AI create a complete experiment with Control and Treatment variants, JSON feature configurations, and metric tracking definitions.

### Step 3: Approve & Provision to Flagsmith
- Review the generated experiment card.
- Click **"Approve & Deploy to Flagsmith"**.
- Verify that the status updates to **ACTIVE** with a direct link/reference to the Flagsmith feature.

### Step 4: Interact with the Live Sandbox & Demo Store
- Navigate to the **Demo Store** (`/demo-store`) or **Customer Sandbox** (`/sandbox`).
- Switch user identities (e.g. `user_alex_dev`, `user_sarah_frontend`, `user_david_lead`).
- Notice how Flagsmith dynamically evaluates `checkout_experience` and renders distinct variations:
  - Multi-Step Checkout (Control)
  - Single-Page Checkout (Variant A)
  - Express Checkout (Variant B)
- Add items to cart and click **"Complete Checkout"** to generate real conversion telemetry with the exact same identity.
- Optionally run the **Synthetic Demo Traffic Simulator** with transparent labeling to stream batches of visitors.

### Step 5: Review Statistical Insights & Canary Rollout
- Navigate to **Experiment Intelligence** (`/analytics`) and **Release Guardian** (`/release-center`).
- Inspect the live conversion rates, uplift %, and p-value curves.
- Review the 5-point release readiness checklist and AI rollout recommendation.
- Progressively shift canary traffic (5% $\to$ 25% $\to$ 50% $\to$ 100%) or execute a **Safe Rollback to 100% Control**.
- Check the **Activity Logs** (`/activity`) to see the complete immutable record of actions taken.

---

## 4. Evaluation Criteria Scorecard

| Criterion | Hackathon Priority | How PulsePilot Delivers |
|---|:---:|---|
| **Track Alignment (AI Agents + Feature Flags)** | ⭐⭐⭐⭐⭐ | Native symbiosis: Gemini acts as the brain (planner/analyst), Flagsmith acts as the hands (actuator/enforcer). |
| **Practical Utility & Feasibility** | ⭐⭐⭐⭐⭐ | Solves real pain points for product managers and engineering leads; eliminates config drift and manual spreadsheet statistics. |
| **Technical Depth & Rigor** | ⭐⭐⭐⭐⭐ | Decoupled deterministic math engine prevents AI hallucinations; dual-tier Flagsmith integration (Management API + React SDK). |
| **Safety & Governance** | ⭐⭐⭐⭐⭐ | Strict Human-in-the-Loop approval workflows, role-based access control, cryptographic audit logging, and $< 500$ ms kill switch. |
| **Design & User Experience** | ⭐⭐⭐⭐⭐ | Executive-grade light theme inspired by Linear, Stripe, and Vercel. Responsive, accessible, and polished micro-interactions. |

