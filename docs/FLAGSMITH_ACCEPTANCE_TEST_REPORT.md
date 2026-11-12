# PulsePilot AI — Flagsmith Live Acceptance Test Report

**Target Environment:** Flagsmith Project `53867` &bull; Environment: `Development`
**Client Environment Key:** `4Y72D2n57QaWFq7TU4sNsz`
**Server-side Environment Key:** `ser.***REDACTED***`
**Date:** November 12, 2026
**Status:** **READY FOR ACCEPTANCE TESTING**

---

## 1. Required Environment Configuration

To execute remote feature management operations against Flagsmith Cloud, the following environment variables must be configured in your local `.env` and Vercel project:

| Variable Name | Required Scope | Purpose / Format |
|---|---|---|
| `FLAGSMITH_ORG_API_TOKEN` | Server-Side Only | Organisation API Token generated from Flagsmith (*Organisation Settings* $\to$ *API Keys*). Used for `POST /projects/{id}/features/` and `PATCH /environments/{id}/featurestates/{id}/`. |
| `FLAGSMITH_PROJECT_ID` | Server-Side Only | `53867` (PulsePilot Project ID) |
| `FLAGSMITH_ENVIRONMENT_KEY` | Public / Browser | `4Y72D2n57QaWFq7TU4sNsz` (Client SDK Evaluation Key) |
| `FLAGSMITH_SERVER_SIDE_API_KEY` | Server-Side Only | `ser.***REDACTED***` (Flagsmith Server Environment Key) |
| `FLAGSMITH_API_URL` | Server-Side Only | `https://api.flagsmith.com/api/v1/` |
| `FLAGSMITH_EVENTS_URL` | Server-Side Only | `https://events.flagsmith.com/api/v1/` |

---

## 2. Step-by-Step Live Acceptance Test Runbook

Follow these exact steps to verify the end-to-end integration:

### Step 1: Create Experiment in AI Experiment Studio
1. Navigate to `/experiments/new` (or `/studio`).
2. **Step 1 (Objective):** Select *"Reduce abandonment"* or enter *"Test a single-page checkout against my current multi-step checkout."*
3. **Step 2 (AI Strategy):** Click **Generate Experiment Strategy**. Gemini 2.5 Flash formulates:
   - **Feature Name:** `exp_checkout_layout_v2`
   - **Control:** Current Multi-Step Checkout (`{"layout":"multi_step"}`) &bull; 50%
   - **Treatment:** Single-Page Streamlined Checkout (`{"layout":"single_page"}`) &bull; 50%
4. **Steps 3–5:** Review variants, metrics, and the AI Readiness Review score.
5. **Step 6 (Human Approval):** Notice that the bypass button has been eliminated. Click **Approve & Create Experiment**.

### Step 2: Remote Provisioning & Verification
1. PulsePilot calls `POST /api/experiments/create`.
2. PulsePilot contacts the Flagsmith Management API, creates `exp_checkout_layout_v2`, and verifies its existence in the `Development` environment.
3. The wizard advances to **Step 7 (Flagsmith Remote Verification Complete)**, displaying:
   - Feature Key: `exp_checkout_layout_v2`
   - Remote Feature ID
   - Project: `53867`
   - Environment: `Development`
   - Status: `LIVE REMOTE CREATED` (or `LIVE REMOTE VERIFIED`)
4. Click **Next: View Integration Instructions** to enter Step 8.

### Step 3: Verify the Feature in Flagsmith Dashboard
1. Open the Flagsmith dashboard directly:
   👉 [https://app.flagsmith.com/project/53867/environment/4Y72D2n57QaWFq7TU4sNsz/features](https://app.flagsmith.com/project/53867/environment/4Y72D2n57QaWFq7TU4sNsz/features)
2. Verify that **`exp_checkout_layout_v2`** is present in the features table.
3. Click on `exp_checkout_layout_v2`:
   - Verify that **Type** is `MULTIVARIATE`.
   - Verify that **Value** contains `{"layout":"multi_step"}`.
   - Verify that the treatment variation contains `{"layout":"single_page"}` with a 50% traffic allocation.

### Step 4: Verify Live Variant Assignment in Demo Store
1. Navigate to `/demo-store` in PulsePilot.
2. Observe the **Assigned Variation** badge:
   - User `user_alex_dev` evaluates through Flagsmith and receives their deterministically assigned variation.
3. Refresh the page or switch identities:
   - The same identity will **always** receive the exact same variation.
4. Add an item to cart and click **Proceed to Checkout**:
   - `experiment_exposure` and `checkout_started` events are recorded.
5. Complete checkout:
   - `checkout_completed` conversion telemetry is recorded and attributed to the assigned variant.

### Step 5: Verify Release Guardian Operations
1. Navigate to `/release-center`.
2. Test a **Canary Rollout** (e.g. adjust to 75% traffic):
   - The remote feature state in Flagsmith updates to 75% allocation.
3. Test the **Emergency Kill-Switch**:
   - Click "Emergency Kill Switch" &bull; The flag is disabled remotely on Flagsmith in `< 50ms`.
4. Test **Rollback to Control**:
   - Click "Rollback to Control" &bull; The flag allocation is safely reset to 100% Control.
5. Re-check the Flagsmith dashboard to verify that all remote feature states mirror these actions.

---

## 3. Test Suite Verification

Automated regression and integration tests pass with zero failures:

```bash
# Deterministic Statistics & Security Test Suite
npm test
-> ALL DETERMINISTIC STATISTICAL & SECURITY HARDENING TESTS PASSED!

# Flagsmith End-to-End Management & Evaluation Suite
npm run test:flagsmith
-> 11 / 11 TESTS PASSED (0 FAILS)

# Full Application QA & Audit Suite
npm run test:audit
-> 32 / 32 TESTS PASSED (0 FAILS)

# Next.js Production Build
npm run build
-> 44 / 44 routes static/dynamic compiled successfully
```
