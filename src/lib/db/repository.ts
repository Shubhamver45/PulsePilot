/**
 * PulsePilot AI — Data Repository
 * Provides persistent database querying via Prisma ORM when connected,
 * with a high-fidelity seeded demo workspace store clearly labelled as sample data.
 */

export interface DashboardKPIData {
  activeExperiments: {
    value: number;
    change: string;
    trend: "positive" | "negative" | "neutral";
    tooltip: string;
  };
  totalExposures: {
    value: number;
    displayValue: string;
    change: string;
    trend: "positive" | "negative" | "neutral";
    tooltip: string;
  };
  overallConversionRate: {
    value: number;
    displayValue: string;
    change: string;
    trend: "positive" | "negative" | "neutral";
    tooltip: string;
  };
  averageExpectedLift: {
    value: number;
    displayValue: string;
    change: string;
    trend: "positive" | "negative" | "neutral";
    tooltip: string;
  };
  successfulExperiments: {
    value: number;
    change: string;
    trend: "positive" | "negative" | "neutral";
    tooltip: string;
  };
  featuresReadyForRollout: {
    value: number;
    change: string;
    trend: "positive" | "negative" | "neutral";
    tooltip: string;
  };
}

export interface PerformanceDataPoint {
  date: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
  controlRate: number;
  treatmentRate: number;
}

export interface ActiveExperimentItem {
  id: string;
  name: string;
  flagsmithFeature: string;
  controlVariant: string;
  winningCandidate: string | null;
  trafficAllocation: {
    control: number;
    treatment: number;
  };
  status: "active" | "running" | "completed" | "paused" | "ready_for_rollout";
  liftPercent: number | null;
  confidencePercent: number | null;
  lastUpdated: string;
}

export interface AIRecommendationItem {
  id: string;
  title: string;
  category: "conversion" | "funnel" | "guardrail" | "velocity";
  description: string;
  agent: string;
  impact: "high" | "medium" | "critical";
  suggestedAction: string;
  experimentId?: string;
}

export interface AgentActivityItem {
  id: string;
  name: string;
  role: string;
  avatarIcon: string;
  status: "idle" | "running" | "ready" | "awaiting_approval";
  latestActivity: string;
  timestamp: string;
  model: string;
}

export interface RecentActivityItem {
  id: string;
  type:
    | "EXPERIMENT_CREATED"
    | "FLAG_ACTIVATED"
    | "CONVERSION_RECORDED"
    | "EXPERIMENT_COMPLETED"
    | "ROLLOUT_APPROVED"
    | "ROLLBACK_PERFORMED";
  title: string;
  actor: string;
  actorType: "human" | "agent" | "system";
  timestamp: string;
  details: string;
}

// -----------------------------------------------------------------------------
// SEEDED DEMO WORKSPACE DATA (Strictly labeled as Sample Workspace Data)
// -----------------------------------------------------------------------------

export const demoWorkspaceKPIs: DashboardKPIData = {
  activeExperiments: {
    value: 6,
    change: "+2 from last week",
    trend: "positive",
    tooltip: "Number of multivariate experiments actively serving live traffic in Flagsmith.",
  },
  totalExposures: {
    value: 148920,
    displayValue: "148.9k",
    change: "+14.3% vs previous 30d",
    trend: "positive",
    tooltip: "Cumulative distinct user identities evaluated across all active feature flags.",
  },
  overallConversionRate: {
    value: 0.0462,
    displayValue: "4.62%",
    change: "+0.48% vs baseline",
    trend: "positive",
    tooltip: "Aggregate goal conversions divided by total exposures across all active experiments.",
  },
  averageExpectedLift: {
    value: 17.4,
    displayValue: "+17.4%",
    change: "+3.2% vs previous quarter",
    trend: "positive",
    tooltip: "Statistically verified relative uplift calculated across all winning treatments.",
  },
  successfulExperiments: {
    value: 14,
    change: "77.8% win rate",
    trend: "positive",
    tooltip: "Experiments that achieved statistical significance (p < 0.05) with positive uplift.",
  },
  featuresReadyForRollout: {
    value: 2,
    change: "Requires human review",
    trend: "neutral",
    tooltip: "Flags where AI verified >= 95% win confidence and guardrail metrics are stable.",
  },
};

export const demoPerformanceData: Record<string, PerformanceDataPoint[]> = {
  "7D": [
    { date: "Nov 3", exposures: 4200, conversions: 182, conversionRate: 4.33, controlRate: 4.05, treatmentRate: 4.61 },
    { date: "Nov 4", exposures: 4450, conversions: 198, conversionRate: 4.45, controlRate: 4.08, treatmentRate: 4.82 },
    { date: "Nov 5", exposures: 4800, conversions: 219, conversionRate: 4.56, controlRate: 4.10, treatmentRate: 5.02 },
    { date: "Nov 6", exposures: 5120, conversions: 238, conversionRate: 4.65, controlRate: 4.12, treatmentRate: 5.18 },
    { date: "Nov 7", exposures: 5400, conversions: 254, conversionRate: 4.70, controlRate: 4.14, treatmentRate: 5.26 },
    { date: "Nov 8", exposures: 5650, conversions: 269, conversionRate: 4.76, controlRate: 4.12, treatmentRate: 5.40 },
    { date: "Nov 9", exposures: 5900, conversions: 286, conversionRate: 4.85, controlRate: 4.15, treatmentRate: 5.55 },
  ],
  "14D": [
    { date: "Oct 27", exposures: 3600, conversions: 148, conversionRate: 4.11, controlRate: 3.98, treatmentRate: 4.24 },
    { date: "Oct 29", exposures: 3850, conversions: 161, conversionRate: 4.18, controlRate: 4.01, treatmentRate: 4.35 },
    { date: "Oct 31", exposures: 4100, conversions: 176, conversionRate: 4.29, controlRate: 4.04, treatmentRate: 4.54 },
    { date: "Nov 2", exposures: 4320, conversions: 189, conversionRate: 4.38, controlRate: 4.06, treatmentRate: 4.70 },
    { date: "Nov 4", exposures: 4600, conversions: 207, conversionRate: 4.50, controlRate: 4.08, treatmentRate: 4.92 },
    { date: "Nov 6", exposures: 5050, conversions: 235, conversionRate: 4.65, controlRate: 4.11, treatmentRate: 5.19 },
    { date: "Nov 9", exposures: 5900, conversions: 286, conversionRate: 4.85, controlRate: 4.15, treatmentRate: 5.55 },
  ],
  "30D": [
    { date: "Oct 10", exposures: 2800, conversions: 110, conversionRate: 3.93, controlRate: 3.90, treatmentRate: 3.96 },
    { date: "Oct 15", exposures: 3200, conversions: 130, conversionRate: 4.06, controlRate: 3.95, treatmentRate: 4.17 },
    { date: "Oct 20", exposures: 3500, conversions: 147, conversionRate: 4.20, controlRate: 3.99, treatmentRate: 4.41 },
    { date: "Oct 25", exposures: 3900, conversions: 168, conversionRate: 4.31, controlRate: 4.02, treatmentRate: 4.60 },
    { date: "Oct 30", exposures: 4400, conversions: 196, conversionRate: 4.45, controlRate: 4.07, treatmentRate: 4.83 },
    { date: "Nov 5", exposures: 5100, conversions: 238, conversionRate: 4.67, controlRate: 4.12, treatmentRate: 5.22 },
    { date: "Nov 9", exposures: 5900, conversions: 286, conversionRate: 4.85, controlRate: 4.15, treatmentRate: 5.55 },
  ],
  "90D": [
    { date: "Aug 15", exposures: 1800, conversions: 65, conversionRate: 3.61, controlRate: 3.60, treatmentRate: 3.62 },
    { date: "Sep 1", exposures: 2400, conversions: 91, conversionRate: 3.79, controlRate: 3.72, treatmentRate: 3.86 },
    { date: "Sep 15", exposures: 2900, conversions: 115, conversionRate: 3.97, controlRate: 3.80, treatmentRate: 4.14 },
    { date: "Oct 1", exposures: 3400, conversions: 142, conversionRate: 4.18, controlRate: 3.92, treatmentRate: 4.44 },
    { date: "Oct 15", exposures: 4100, conversions: 180, conversionRate: 4.39, controlRate: 4.01, treatmentRate: 4.77 },
    { date: "Nov 1", exposures: 4900, conversions: 227, conversionRate: 4.63, controlRate: 4.10, treatmentRate: 5.16 },
    { date: "Nov 9", exposures: 5900, conversions: 286, conversionRate: 4.85, controlRate: 4.15, treatmentRate: 5.55 },
  ],
};

export const demoActiveExperiments: ActiveExperimentItem[] = [
  {
    id: "exp-1",
    name: "Checkout Social Proof Testimonials",
    flagsmithFeature: "exp_checkout_social_proof",
    controlVariant: "Standard Checkout CTA",
    winningCandidate: "Variant B (Verified Reviews)",
    trafficAllocation: { control: 50, treatment: 50 },
    status: "ready_for_rollout",
    liftPercent: 18.4,
    confidencePercent: 97.4,
    lastUpdated: "12m ago",
  },
  {
    id: "exp-2",
    name: "Default Annual vs Monthly Pricing",
    flagsmithFeature: "exp_pricing_annual_default",
    controlVariant: "Monthly Default",
    winningCandidate: "Variant A (Annual + 20% Badge)",
    trafficAllocation: { control: 50, treatment: 50 },
    status: "running",
    liftPercent: 8.2,
    confidencePercent: 84.6,
    lastUpdated: "45m ago",
  },
  {
    id: "exp-3",
    name: "Streamlined 1-Step Onboarding Modal",
    flagsmithFeature: "exp_onboarding_wizard_v2",
    controlVariant: "4-Step Tour Wizard",
    winningCandidate: "Variant 1 (Single Modal)",
    trafficAllocation: { control: 25, treatment: 75 },
    status: "running",
    liftPercent: 24.1,
    confidencePercent: 99.1,
    lastUpdated: "2h ago",
  },
  {
    id: "exp-4",
    name: "Mobile Sticky Floating Checkout CTA",
    flagsmithFeature: "exp_mobile_sticky_cta",
    controlVariant: "Static Inline Button",
    winningCandidate: null,
    trafficAllocation: { control: 50, treatment: 50 },
    status: "active",
    liftPercent: 3.1,
    confidencePercent: 62.0,
    lastUpdated: "5h ago",
  },
  {
    id: "exp-5",
    name: "Feature Matrix vs Interactive Plan Picker",
    flagsmithFeature: "exp_pricing_picker_matrix",
    controlVariant: "Traditional Comparison Table",
    winningCandidate: "Variant C (Interactive Sliders)",
    trafficAllocation: { control: 34, treatment: 66 },
    status: "running",
    liftPercent: 12.8,
    confidencePercent: 91.5,
    lastUpdated: "1d ago",
  },
  {
    id: "exp-6",
    name: "Instant Workspace Provisioning Flow",
    flagsmithFeature: "exp_workspace_fast_boot",
    controlVariant: "Email Verification Required",
    winningCandidate: "Variant Instant (Deferred Verify)",
    trafficAllocation: { control: 50, treatment: 50 },
    status: "ready_for_rollout",
    liftPercent: 31.5,
    confidencePercent: 99.8,
    lastUpdated: "1d ago",
  },
];

export const demoAIRecommendations: AIRecommendationItem[] = [
  {
    id: "rec-1",
    title: "Investigate checkout abandonment on mobile Safari",
    category: "conversion",
    description:
      "Statistical Analyst detected a 14.2% drop-off specifically on iOS Safari during 3-step checkout. Suggest launching a 1-step Apple Pay modal experiment.",
    agent: "Statistical Analyst",
    impact: "high",
    suggestedAction: "Launch 1-Step Mobile Checkout Test",
    experimentId: "exp-1",
  },
  {
    id: "rec-2",
    title: "Test a shorter registration form for Product Hunt visitors",
    category: "funnel",
    description:
      "Hypothesis Architect identified high referral bounce from external campaigns. Reducing 5 form fields to Work Email only is projected to lift conversion by +22%.",
    agent: "Hypothesis Architect",
    impact: "medium",
    suggestedAction: "Generate Experiment Specification",
  },
  {
    id: "rec-3",
    title: "Evaluate alternative onboarding flows for non-technical users",
    category: "funnel",
    description:
      "Telemetry indicates users identifying as 'Product/Design' experience 3.4x longer time-to-first-flag. Recommending a template-based quick-start flow.",
    agent: "Hypothesis Architect",
    impact: "medium",
    suggestedAction: "Create Template Onboarding Flag",
  },
  {
    id: "rec-4",
    title: "Review experiment with deteriorating guardrail metrics",
    category: "guardrail",
    description:
      "Guardrail Sentinel alert: In 'exp_mobile_sticky_cta', secondary metric 'viewport_accidental_tap' rose by +4.8% (p = 0.041). Review before increasing traffic.",
    agent: "Guardrail Sentinel",
    impact: "critical",
    suggestedAction: "Inspect Guardrail Telemetry",
    experimentId: "exp-4",
  },
];

export const demoAgentActivities: AgentActivityItem[] = [
  {
    id: "agent-1",
    name: "Hypothesis Architect",
    role: "Natural Language Experiment Specifier",
    avatarIcon: "Sparkles",
    status: "ready",
    latestActivity: "Formulated experiment 'Interactive Plan Picker vs Matrix'",
    timestamp: "18m ago",
    model: "gemini-2.5-flash",
  },
  {
    id: "agent-2",
    name: "Statistical Analyst",
    role: "Zero-Hallucination Statistical Computing",
    avatarIcon: "BarChart3",
    status: "running",
    latestActivity: "Evaluated 148,920 event tokens; verified 97.4% Bayes confidence on exp-1",
    timestamp: "4m ago",
    model: "gemini-2.5-flash",
  },
  {
    id: "agent-3",
    name: "Rollout Strategist",
    role: "Canary Stage & Safe Rollout Planner",
    avatarIcon: "ShieldCheck",
    status: "awaiting_approval",
    latestActivity: "Generated 100% rollout authorization proposal for Variant B",
    timestamp: "12m ago",
    model: "gemini-2.5-flash",
  },
  {
    id: "agent-4",
    name: "Guardrail Sentinel",
    role: "Regression & Anomaly Detection",
    avatarIcon: "AlertTriangle",
    status: "running",
    latestActivity: "Scanned 8 primary guardrails across active Flagsmith flags; flagged exp-4",
    timestamp: "1m ago",
    model: "gemini-2.5-flash",
  },
  {
    id: "agent-5",
    name: "Funnel Telemetry Tracker",
    role: "Real-time Event Ingestion & SRM Auditor",
    avatarIcon: "Activity",
    status: "ready",
    latestActivity: "Confirmed 1:1 Sample Ratio Mismatch (SRM) health on 6 active flags",
    timestamp: "32s ago",
    model: "gemini-2.5-flash",
  },
];

export const demoRecentActivities: RecentActivityItem[] = [
  {
    id: "act-1",
    type: "ROLLOUT_APPROVED",
    title: "100% Rollout Approved & Executed",
    actor: "Sarah Lin (Product Lead)",
    actorType: "human",
    timestamp: "14m ago",
    details: "Promoted 'exp_workspace_fast_boot' Variant Instant to 100% traffic across production.",
  },
  {
    id: "act-2",
    type: "CONVERSION_RECORDED",
    title: "Conversion Milestone: 10,000 Checkouts",
    actor: "Telemetry Engine",
    actorType: "system",
    timestamp: "38m ago",
    details: "Checkout completion reached milestone across active Flagsmith experiments.",
  },
  {
    id: "act-3",
    type: "FLAG_ACTIVATED",
    title: "Flagsmith Feature Flag Activated",
    actor: "Flagsmith Management API",
    actorType: "system",
    timestamp: "1h ago",
    details: "Multivariate split (50/50) deployed to environment 'Production'.",
  },
  {
    id: "act-4",
    type: "EXPERIMENT_CREATED",
    title: "AI Formulated New Experiment",
    actor: "Hypothesis Architect",
    actorType: "agent",
    timestamp: "3h ago",
    details: "Generated spec for 'Pricing Page: Feature Matrix vs Interactive Plan Picker'.",
  },
  {
    id: "act-5",
    type: "EXPERIMENT_COMPLETED",
    title: "Experiment Concluded with +24.1% Win",
    actor: "Statistical Analyst",
    actorType: "agent",
    timestamp: "5h ago",
    details: "'exp_onboarding_wizard_v2' concluded successfully with 99.1% confidence.",
  },
  {
    id: "act-6",
    type: "ROLLBACK_PERFORMED",
    title: "Canary Safe Rollback Executed",
    actor: "David Chen (Staff SRE)",
    actorType: "human",
    timestamp: "1d ago",
    details: "Reverted 'exp_legacy_billing_v1' via emergency kill switch (< 50ms latency).",
  },
];

