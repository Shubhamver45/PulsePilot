# 🎬 PulsePilot AI — Final Competition Video Script
**Competition:** WeMakeDevs × Flagsmith Toggle Wars — Track 02  
**Prize:** $1,000 Cash  
**Target Duration:** 2 minutes 45 seconds to 2 minutes 55 seconds  
**Live App:** https://pulse-pilot-two.vercel.app/

---

## VIDEO STRUCTURE (YouTube-Style)

```
0:00 ─── HOOK + PROJECT NAME (10s)
0:10 ─── PROBLEM STATEMENT (15s)
0:25 ─── SOLUTION OVERVIEW (15s)
0:40 ─── LIVE DEMO: AI Experiment Studio (25s)
1:05 ─── LIVE DEMO: Flagsmith Integration (20s)
1:25 ─── LIVE DEMO: Demo Store + Feature Flags (20s)
1:45 ─── LIVE DEMO: Analytics (No Fake Stats) (20s)
2:05 ─── LIVE DEMO: Release + Human Approval (25s)
2:30 ─── LIVE DEMO: Audit Trail (10s)
2:40 ─── CLOSING + CALL TO ACTION (12s)
2:52 ─── END
```

---

## EXACT SCRIPT — READ THIS WHILE RECORDING

### 🎬 SCENE 1 — HOOK + PROJECT NAME (0:00 – 0:10)
**What to show:** Dashboard page (https://pulse-pilot-two.vercel.app/)  
**What to do:** Just show the dashboard, slowly scroll down to show the cards  

**SAY THIS:**
> "This is PulsePilot AI — an autonomous experimentation platform that turns growth ideas into real, governed A/B tests using AI agents and Flagsmith feature flags."

---

### ❌ SCENE 2 — PROBLEM STATEMENT (0:10 – 0:25)
**What to show:** Stay on dashboard, point to the experiment cards  
**What to do:** Hover over the experiment cards to highlight them  

**SAY THIS:**
> "Here's the problem. Product teams come up with great growth ideas every week, but turning those ideas into proper experiments takes days of manual work — designing variants, setting up feature flags, computing statistics, and making safe release decisions. Most teams either skip testing or ship changes blindly."

---

### 💡 SCENE 3 — SOLUTION OVERVIEW (0:25 – 0:40)
**What to show:** Still on dashboard, slowly scroll to show the AI agent status cards and integration indicators  
**What to do:** Point out the live integration badges (Gemini, Flagsmith, Supabase)  

**SAY THIS:**
> "PulsePilot solves this with four specialized AI agents powered by Google Gemini, connected to real Flagsmith Cloud infrastructure. You describe what you want to test in plain English, and PulsePilot handles the rest — from experiment design to governed production releases."

---

### 🤖 SCENE 4 — LIVE DEMO: AI Experiment Studio (0:40 – 1:05)
**What to show:** Navigate to Experiment Studio (/studio)  
**What to do:**
1. Click on the Studio page in sidebar
2. Type in the objective field: "Increase checkout conversion by simplifying the payment flow"
3. Click the "Generate Strategy" button
4. Wait for Gemini to respond — show the generated hypothesis, variants, metrics, and guardrails
5. Slowly scroll through the generated strategy

**SAY THIS:**
> "Let me show you. In the Experiment Studio, I type a simple growth objective — 'increase checkout conversion by simplifying the payment flow.' PulsePilot's Strategy Agent, powered by Gemini, generates a complete experiment plan — hypothesis, control and treatment variants, success metrics, and safety guardrails. No manual experiment design needed."

---

### 🚩 SCENE 5 — LIVE DEMO: Flagsmith Integration (1:05 – 1:25)
**What to show:** Navigate to Flagsmith Integration (/integrations/flagsmith)  
**What to do:**
1. Click on the Flagsmith integration page
2. Show the live connection status (green indicators)
3. Show Project ID 53867, Environment 115953
4. Show the feature flag `exp_checkout_layout_v2` with its variants
5. Show the identity evaluation section

**SAY THIS:**
> "This isn't a mock integration. PulsePilot connects directly to Flagsmith Cloud — Project 53867, Development Environment. You can see the actual feature flag with multivariate configuration, real identity evaluation, and edge API verification. Every operation hits the live Flagsmith API."

---

### 🛒 SCENE 6 — LIVE DEMO: Demo Store (1:25 – 1:45)
**What to show:** Navigate to Demo Store (/demo-store)  
**What to do:**
1. Show the store with default user (Elena — Control experience)
2. Point out the multi-step checkout flow
3. Switch to user Alex (Treatment experience)
4. Show the single-page express checkout with coupon GROWTH20
5. Highlight that the SAME app shows DIFFERENT experiences

**SAY THIS:**
> "In the Demo Store, different users get different checkout experiences through Flagsmith identity evaluation. Elena sees the multi-step control flow. Alex gets the single-page express treatment with a coupon code. Same application, different experiences — powered by real feature flags, not hardcoded logic."

---

### 📊 SCENE 7 — LIVE DEMO: Analytics (1:45 – 2:05)
**What to show:** Navigate to Analytics (/analytics)  
**What to do:**
1. Show the experiment analytics scorecard
2. Point to the conversion rates (Control: 4.08%, Treatment: 4.91%)
3. Point to the p-value (0.134) and confidence interval
4. Highlight the "COLLECTING DATA" / "UNDERPOWERED" status badge
5. This is the KEY differentiator — honest stats, no fake winners

**SAY THIS:**
> "Here's what makes PulsePilot different. The analytics are computed deterministically — no AI hallucination. We see a 20 percent uplift in the treatment, but the p-value is 0.134 and the confidence interval crosses zero. Instead of declaring a fake winner, PulsePilot honestly says 'collecting data — underpowered.' The platform refuses to lie about statistics."

---

### 🛡️ SCENE 8 — LIVE DEMO: Release Center (2:05 – 2:30)
**What to show:** Navigate to Release Center (/release-center)  
**What to do:**
1. Show the release readiness matrix
2. Show the AI recommendation (what the agent suggests)
3. Show the configuration diff
4. Point to the HUMAN APPROVAL requirement
5. Show that no release happens without a human clicking approve
6. If there's a completed release, show the verification badge

**SAY THIS:**
> "Production releases require human oversight. The Release Guardian evaluates experiment evidence, shows a configuration diff, and recommends an action. But nothing ships without human approval. Every rollout is verified against the remote Flagsmith configuration, and every action is logged with a SHA-256 hash for tamper-evidence."

---

### 📋 SCENE 9 — LIVE DEMO: Audit Trail (2:30 – 2:40)
**What to show:** Navigate to Activity/Audit (/activity)  
**What to do:**
1. Show the audit log entries
2. Point to the SHA-256 hash chain
3. Quickly scroll through the entries

**SAY THIS:**
> "Every operation — experiment creation, flag evaluation, release approval — is recorded in a tamper-evident audit chain. Full transparency, full accountability."

---

### 🏆 SCENE 10 — CLOSING (2:40 – 2:52)
**What to show:** Go back to Dashboard  
**What to do:** Show the full dashboard one more time  

**SAY THIS:**
> "PulsePilot AI — from growth ideas to governed experimentation. Real AI agents, real Flagsmith integration, honest analytics, and human-governed releases. Built for Track 02 of the Flagsmith Toggle Wars. Thank you."

---

## 🎤 VOICE TIPS

- **Speak naturally** — like you're showing a friend your project, not reading a script
- **Pace:** Normal conversational speed, about 150-160 words per minute
- **Tone:** Confident and proud — you built something impressive
- **Pause** briefly between sections (1-2 seconds)
- **Don't rush** — if a section runs a bit long, trim the next one slightly
- **Practice once** before recording — just read through the script once out loud

## ⏱️ TIMING TIPS

- Total target: **2 minutes 52 seconds**
- If you're running long, cut Scene 9 (Audit) shorter — just flash it for 5 seconds
- If you're running short, take your time on Scene 4 (Studio) — show the AI generation in more detail
- The live demo sections (Scenes 4-9) are the most important — spend the most time there

