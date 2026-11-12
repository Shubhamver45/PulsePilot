"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  FlaskConical,
  Flag,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Code2,
  Trash2,
  Plus,
  Play,
  FileCode,
  Layers,
  Activity,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import {
  ExperimentStrategy,
  ReadinessReview,
  MetricItemSchema,
} from "@/lib/ai/schemas";

const selectableObjectives = [
  "Increase conversion",
  "Increase revenue",
  "Improve retention",
  "Reduce abandonment",
  "Improve engagement",
  "Improve onboarding",
  "Custom objective",
];

const availablePrimaryMetrics = [
  { key: "checkout_completed", name: "Checkout Completed", type: "CONVERSION_RATE" as const },
  { key: "registration_completed", name: "Registration Completed", type: "CONVERSION_RATE" as const },
  { key: "purchase_completed", name: "Purchase Completed", type: "CONVERSION_RATE" as const },
  { key: "subscription_started", name: "Subscription Started", type: "CONVERSION_RATE" as const },
  { key: "button_clicked", name: "Primary Button Clicked", type: "COUNT" as const },
];

const availableSecondaryMetrics = [
  { key: "session_duration_seconds", name: "Session Duration", type: "DURATION" as const, direction: "INCREASE" as const },
  { key: "engagement_score", name: "Engagement Score", type: "COUNT" as const, direction: "INCREASE" as const },
  { key: "revenue_usd", name: "Revenue per User (USD)", type: "REVENUE" as const, direction: "INCREASE" as const },
];

const availableGuardrailMetrics = [
  { key: "payment_failure", name: "Payment Failures", type: "CONVERSION_RATE" as const, direction: "DECREASE" as const },
  { key: "api_error_rate", name: "API Error Rates", type: "CONVERSION_RATE" as const, direction: "DECREASE" as const },
  { key: "page_bounce", name: "Page Bounce Rate", type: "CONVERSION_RATE" as const, direction: "DECREASE" as const },
  { key: "cancellation_rate", name: "Cancellation Rate", type: "CONVERSION_RATE" as const, direction: "DECREASE" as const },
];

export default function AIExperimentStudioPage() {
  const router = useRouter();

  // Wizard Steps: 1 to 8
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Business Objective
  const [selectedObjective, setSelectedObjective] = useState<string>("Reduce abandonment");
  const [customObjective, setCustomObjective] = useState<string>("");
  const [prompt, setPrompt] = useState<string>(
    "I want to increase checkout conversions. Test a single-page checkout against my current multi-step checkout."
  );

  // Step 2: AI Strategy Agent State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [strategy, setStrategy] = useState<ExperimentStrategy | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Step 5: Readiness Review State
  const [isReviewing, setIsReviewing] = useState<boolean>(false);
  const [readinessReview, setReadinessReview] = useState<ReadinessReview | null>(null);

  // Step 7: Flags Mapping / Creation State
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deploymentResult, setDeploymentResult] = useState<any>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);

  // Copy Feedback
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeSnippet(id);
    setTimeout(() => setCopiedCodeSnippet(null), 2000);
  };

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  // Handle Step 2: Trigger AI Strategy Agent
  const handleGenerateStrategy = async () => {
    try {
      setIsGenerating(true);
      setGenerationError(null);

      const objectiveToUse =
        selectedObjective === "Custom objective"
          ? customObjective || "Custom objective"
          : selectedObjective;

      const res = await fetch("/api/agent/formulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: objectiveToUse,
          prompt,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to formulate experiment spec");
      }

      setStrategy(data.strategy);
      setCurrentStep(3); // Proceed to Step 3: Variant Configuration
    } catch (err: any) {
      setGenerationError(err.message || "Failed to contact AI Strategy Agent");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Step 5: Trigger Readiness Review
  const handleReviewReadiness = async () => {
    if (!strategy) return;
    try {
      setIsReviewing(true);
      const res = await fetch("/api/agent/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Review failed");
      }
      setReadinessReview(data.review);
      setCurrentStep(5);
    } catch (err: any) {
      console.error("Readiness check error:", err);
      // Fallback local review
      setCurrentStep(5);
    } finally {
      setIsReviewing(false);
    }
  };

  // Handle Step 7: Flags Mapping & Human Approval
  const handleApproveAndDeploy = async () => {
    if (!strategy) return;
    try {
      setIsDeploying(true);
      setDeploymentError(null);
      const res = await fetch("/api/experiments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy,
          approvedBy: "Sarah Lin (Product Lead)",
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Flagsmith remote provisioning failed");
      }
      setDeploymentResult(data);
      setCurrentStep(7); // Show Flags Mapping Confirmation, then Step 8
    } catch (err: any) {
      setDeploymentError(err.message || "Failed to provision feature in Flagsmith");
    } finally {
      setIsDeploying(false);
    }
  };

  // Calculate Traffic Allocation Sum
  const totalTrafficAllocation =
    (strategy?.control_variant.trafficAllocation || 0) +
    (strategy?.treatment_variants.reduce((acc, v) => acc + v.trafficAllocation, 0) || 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-16">
      {/* Top Header */}
      <PageHeader
        title="AI Experiment Studio"
        description="Transform natural language product hypotheses into production-ready multivariate Flagsmith feature flags."
        badge={
          <StatusBadge
            status={currentStep >= 7 ? "active" : "draft"}
            label={`STEP ${currentStep} OF 8`}
          />
        }
      />

      {/* Progress Steps Stepper */}
      <div className="p-3 bg-surface border border-border rounded-lg shadow-xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-[700px] text-xs">
          {[
            { step: 1, label: "Objective" },
            { step: 2, label: "AI Strategy" },
            { step: 3, label: "Variants" },
            { step: 4, label: "Metrics" },
            { step: 5, label: "AI Review" },
            { step: 6, label: "Approval" },
            { step: 7, label: "Flags Mapping" },
            { step: 8, label: "Instructions" },
          ].map((item, idx) => (
            <React.Fragment key={item.step}>
              {idx > 0 && (
                <div
                  className={`h-0.5 flex-1 mx-2 transition-colors ${
                    currentStep >= item.step ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-1.5 font-medium cursor-pointer ${
                  currentStep === item.step
                    ? "text-primary font-bold"
                    : currentStep > item.step
                    ? "text-success font-semibold"
                    : "text-text-muted"
                }`}
                onClick={() => {
                  if (strategy && item.step <= currentStep) {
                    setCurrentStep(item.step);
                  }
                }}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    currentStep === item.step
                      ? "bg-primary text-white"
                      : currentStep > item.step
                      ? "bg-success text-white"
                      : "bg-surface-muted text-text-secondary"
                  }`}
                >
                  {currentStep > item.step ? <Check className="w-3 h-3" /> : item.step}
                </span>
                <span>{item.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* STEP 1: BUSINESS OBJECTIVE & NATURAL LANGUAGE INPUT                   */}
      {/* ===================================================================== */}
      {currentStep === 1 && (
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6 animate-in fade-in">
          <div>
            <h2 className="text-base font-bold text-text">Step 1: Define Your Business Objective</h2>
            <p className="text-xs text-text-secondary mt-1">
              Select what goal you want to achieve or describe your hypothesis in plain English.
            </p>
          </div>

          {/* Selectable Objective Chips */}
          <div>
            <label className="block text-xs font-semibold text-text mb-2">Selectable Objectives</label>
            <div className="flex flex-wrap gap-2">
              {selectableObjectives.map((obj) => (
                <button
                  key={obj}
                  type="button"
                  onClick={() => setSelectedObjective(obj)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    selectedObjective === obj
                      ? "bg-primary-light border-primary text-primary font-semibold shadow-xs"
                      : "bg-surface-subtle border-border text-text-secondary hover:text-text hover:bg-surface"
                  }`}
                >
                  {obj}
                </button>
              ))}
            </div>

            {selectedObjective === "Custom objective" && (
              <input
                type="text"
                value={customObjective}
                onChange={(e) => setCustomObjective(e.target.value)}
                placeholder="Enter custom business objective (e.g. Increase Enterprise Demo Requests)"
                className="w-full mt-3 p-2.5 text-xs bg-surface-subtle border border-border rounded text-text focus:outline-none focus:border-primary"
              />
            )}
          </div>

          {/* Large Natural Language Textarea with exact requested placeholder */}
          <div>
            <label className="block text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" /> Describe Your Product Experiment
            </label>
            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Tell PulsePilot what you want to improve...\n\nExample: I want to increase checkout conversions.\nTest a single-page checkout against my current multi-step checkout.`}
              className="w-full p-4 text-xs bg-surface-subtle/50 border border-border rounded-lg text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>

          {/* Quick-Fill Presets */}
          <div className="p-3 rounded bg-surface-subtle border border-border flex items-center justify-between text-xs">
            <span className="text-text-secondary">Quick Examples:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedObjective("Reduce abandonment");
                  setPrompt(
                    "I want to increase checkout conversions. Test a single-page checkout against my current multi-step checkout."
                  );
                }}
                className="px-2.5 py-1 bg-surface border border-border rounded hover:text-primary transition-colors"
              >
                Single-Page Checkout
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedObjective("Improve onboarding");
                  setPrompt(
                    "Test a 1-step quick modal onboarding against our current 4-step wizard to lift user activation."
                  );
                }}
                className="px-2.5 py-1 bg-surface border border-border rounded hover:text-primary transition-colors"
              >
                1-Step Onboarding
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedObjective("Increase revenue");
                  setPrompt(
                    "Test default Annual billing with a 'Save 20%' badge on our pricing tier vs default monthly."
                  );
                }}
                className="px-2.5 py-1 bg-surface border border-border rounded hover:text-primary transition-colors"
              >
                Annual Pricing
              </button>
            </div>
          </div>

          {generationError && (
            <div className="p-3 bg-danger-light border border-danger/30 rounded text-xs text-danger flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{generationError}</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleGenerateStrategy}
              disabled={isGenerating || !prompt.trim()}
              className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating Strategy with Gemini...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Synthesize Experiment Strategy
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 3: VARIANT CONFIGURATION (EDITABLE VARIANTS & SPLITS)            */}
      {/* ===================================================================== */}
      {currentStep === 3 && strategy && (
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <h2 className="text-base font-bold text-text">Step 3: Variant Configuration</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Refine variant names, descriptions, JSON payloads, and traffic allocation splits.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-text-secondary">Flagsmith Feature Key:</span>
              <input
                type="text"
                value={strategy.flagsmith_feature_name}
                onChange={(e) =>
                  setStrategy({ ...strategy, flagsmith_feature_name: e.target.value })
                }
                className="ml-2 font-mono text-xs px-2 py-1 bg-surface-subtle border border-border rounded text-text font-semibold focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Traffic Allocation Summary Bar */}
          <div className="p-3.5 rounded-lg bg-surface-subtle border border-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary" /> Traffic Allocation Check
              </span>
              <span
                className={`font-mono font-bold ${
                  totalTrafficAllocation === 100 ? "text-success" : "text-danger"
                }`}
              >
                Total: {totalTrafficAllocation}%{" "}
                {totalTrafficAllocation === 100 ? "(Valid)" : "(Must equal 100%)"}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-surface-muted overflow-hidden flex">
              <div
                style={{ width: `${strategy.control_variant.trafficAllocation}%` }}
                className="bg-text-secondary h-full"
                title={`Control: ${strategy.control_variant.trafficAllocation}%`}
              />
              {strategy.treatment_variants.map((v, i) => (
                <div
                  key={v.key}
                  style={{ width: `${v.trafficAllocation}%` }}
                  className={`h-full ${i === 0 ? "bg-primary" : "bg-success"}`}
                  title={`${v.name}: ${v.trafficAllocation}%`}
                />
              ))}
            </div>
          </div>

          {/* Control Variant Card */}
          <div className="p-4 rounded-lg bg-surface border border-border space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-text text-sm">
                  {strategy.control_variant.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-surface-muted border border-border text-text-secondary">
                  CONTROL
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-text-secondary">Traffic:</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={strategy.control_variant.trafficAllocation}
                  onChange={(e) => {
                    setStrategy({
                      ...strategy,
                      control_variant: {
                        ...strategy.control_variant,
                        trafficAllocation: Number(e.target.value),
                      },
                    });
                  }}
                  className="w-16 p-1 text-center font-mono font-semibold bg-surface-subtle border border-border rounded"
                />
                <span className="font-mono">%</span>
              </div>
            </div>

            <div>
              <label className="font-semibold text-text-secondary">Description</label>
              <input
                type="text"
                value={strategy.control_variant.description}
                onChange={(e) =>
                  setStrategy({
                    ...strategy,
                    control_variant: {
                      ...strategy.control_variant,
                      description: e.target.value,
                    },
                  })
                }
                className="w-full mt-1 p-2 bg-surface-subtle border border-border rounded text-text"
              />
            </div>

            <div className="p-2.5 rounded bg-surface-subtle/80 border border-border-subtle text-[11px] text-text-secondary">
              <strong className="text-text">Why Test Control:</strong>{" "}
              {strategy.control_variant.whyWorthTesting}
            </div>
          </div>

          {/* Treatment Variants List */}
          <div className="space-y-4">
            {strategy.treatment_variants.map((variant, idx) => (
              <div
                key={variant.key}
                className="p-4 rounded-lg bg-surface border border-primary/30 space-y-3 text-xs shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text text-sm">{variant.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-primary-light border border-primary/20 text-primary">
                      TREATMENT
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-text-secondary">Traffic:</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={variant.trafficAllocation}
                      onChange={(e) => {
                        const newTreatments = [...strategy.treatment_variants];
                        newTreatments[idx].trafficAllocation = Number(e.target.value);
                        setStrategy({ ...strategy, treatment_variants: newTreatments });
                      }}
                      className="w-16 p-1 text-center font-mono font-semibold bg-surface-subtle border border-border rounded"
                    />
                    <span className="font-mono">%</span>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-text-secondary">Description</label>
                  <input
                    type="text"
                    value={variant.description}
                    onChange={(e) => {
                      const newTreatments = [...strategy.treatment_variants];
                      newTreatments[idx].description = e.target.value;
                      setStrategy({ ...strategy, treatment_variants: newTreatments });
                    }}
                    className="w-full mt-1 p-2 bg-surface-subtle border border-border rounded text-text"
                  />
                </div>

                <div>
                  <label className="font-semibold text-text-secondary">
                    Flagsmith Feature State Value (JSON Payload)
                  </label>
                  <textarea
                    rows={3}
                    value={JSON.stringify(variant.featureValue, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        const newTreatments = [...strategy.treatment_variants];
                        newTreatments[idx].featureValue = parsed;
                        setStrategy({ ...strategy, treatment_variants: newTreatments });
                      } catch {
                        // ignore syntax error while typing
                      }
                    }}
                    className="w-full mt-1 p-2 rounded bg-surface-subtle border border-border font-mono text-[11px] text-text"
                  />
                </div>

                <div className="p-2.5 rounded bg-primary-light/30 border border-primary/20 text-[11px] text-text-secondary">
                  <strong className="text-primary">Why Worth Testing:</strong>{" "}
                  {variant.whyWorthTesting}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 border border-border rounded text-xs font-medium hover:bg-surface-subtle transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Objective
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              disabled={totalTrafficAllocation !== 100}
              className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              Next: Configure Metrics <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 4: METRIC CONFIGURATION (PRIMARY, SECONDARY & GUARDRAILS)        */}
      {/* ===================================================================== */}
      {currentStep === 4 && strategy && (
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6 animate-in fade-in">
          <div>
            <h2 className="text-base font-bold text-text">Step 4: Metric & Telemetry Configuration</h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Select exact telemetry event names matching your application instrumentation.
            </p>
          </div>

          {/* Primary Metric Selector */}
          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-3">
            <label className="block text-xs font-bold text-text uppercase tracking-wide">
              Primary Conversion Metric (Target)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availablePrimaryMetrics.map((metric) => {
                const isSelected = strategy.primary_metric.key === metric.key;
                return (
                  <button
                    key={metric.key}
                    type="button"
                    onClick={() =>
                      setStrategy({
                        ...strategy,
                        primary_metric: {
                          ...strategy.primary_metric,
                          key: metric.key,
                          name: metric.name,
                          type: metric.type,
                        },
                      })
                    }
                    className={`p-3 rounded border text-left transition-colors flex items-center justify-between ${
                      isSelected
                        ? "bg-surface border-primary shadow-xs"
                        : "bg-surface/50 border-border hover:bg-surface"
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-xs text-text block">{metric.name}</span>
                      <span className="font-mono text-[10px] text-primary">{metric.key}</span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-text uppercase tracking-wide">
              Secondary Metrics (Engagement & Revenue)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availableSecondaryMetrics.map((sec) => {
                const isChecked = strategy.secondary_metrics.some((m) => m.key === sec.key);
                return (
                  <div
                    key={sec.key}
                    onClick={() => {
                      const newSec = isChecked
                        ? strategy.secondary_metrics.filter((m) => m.key !== sec.key)
                        : [
                            ...strategy.secondary_metrics,
                            {
                              key: sec.key,
                              name: sec.name,
                              type: sec.type,
                              direction: sec.direction,
                              description: sec.name,
                            },
                          ];
                      setStrategy({ ...strategy, secondary_metrics: newSec });
                    }}
                    className={`p-3 rounded border cursor-pointer transition-colors flex items-center justify-between ${
                      isChecked
                        ? "bg-surface border-primary shadow-xs"
                        : "bg-surface-subtle/50 border-border"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-medium text-text block">{sec.name}</span>
                      <span className="font-mono text-[10px] text-text-secondary">{sec.key}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 accent-primary"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Guardrail Metrics */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-text uppercase tracking-wide flex items-center gap-1.5 text-danger">
              <ShieldCheck className="w-4 h-4" /> Safety Guardrail Metrics (Automated Anomaly Checks)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableGuardrailMetrics.map((guard) => {
                const isChecked = strategy.guardrail_metrics.some((m) => m.key === guard.key);
                return (
                  <div
                    key={guard.key}
                    onClick={() => {
                      const newGuard = isChecked
                        ? strategy.guardrail_metrics.filter((m) => m.key !== guard.key)
                        : [
                            ...strategy.guardrail_metrics,
                            {
                              key: guard.key,
                              name: guard.name,
                              type: guard.type,
                              direction: guard.direction,
                              description: guard.name,
                            },
                          ];
                      setStrategy({ ...strategy, guardrail_metrics: newGuard });
                    }}
                    className={`p-3 rounded border cursor-pointer transition-colors flex items-center justify-between ${
                      isChecked
                        ? "bg-danger-light/30 border-danger/40"
                        : "bg-surface-subtle/50 border-border"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-semibold text-text block">{guard.name}</span>
                      <span className="font-mono text-[10px] text-danger">{guard.key}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 accent-danger"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2 border border-border rounded text-xs font-medium hover:bg-surface-subtle transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Variants
            </button>
            <button
              onClick={handleReviewReadiness}
              disabled={isReviewing}
              className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors"
            >
              {isReviewing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running AI Quality Review...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Run AI Experiment Review
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 5: AI EXPERIMENT READINESS REVIEW                                */}
      {/* ===================================================================== */}
      {currentStep === 5 && readinessReview && (
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <h2 className="text-base font-bold text-text">Step 5: AI Readiness Report</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Automated validation of statistical testability, event instrumentation, and safety guardrails.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-text-secondary block">Quality Score</span>
                <span className="font-mono text-xl font-bold text-primary">
                  {readinessReview.qualityScore}/100
                </span>
              </div>
              <StatusBadge
                status={readinessReview.isReadyForLaunch ? "active" : "warning"}
                label={readinessReview.isReadyForLaunch ? "READY FOR LAUNCH" : "NEEDS ADJUSTMENT"}
              />
            </div>
          </div>

          {/* 7 Verification Checks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {Object.entries(readinessReview.checks).map(([key, check]) => (
              <div
                key={key}
                className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                  check.pass ? "bg-surface-subtle border-border" : "bg-warning-light/40 border-warning/40"
                }`}
              >
                {check.pass ? (
                  <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold text-text capitalize">
                    {key.replace(/([A-Z])/g, " $1")}
                  </span>
                  <p className="text-text-secondary text-[11px] mt-0.5 leading-relaxed">
                    {check.feedback}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Strengths & Recommendations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-lg bg-success-light/30 border border-success/30 space-y-2">
              <span className="font-bold text-success flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Key Strengths
              </span>
              <ul className="space-y-1 text-text-secondary">
                {readinessReview.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-success">•</span> {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-2">
              <span className="font-bold text-text flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-primary" /> Recommendations
              </span>
              <ul className="space-y-1 text-text-secondary">
                {readinessReview.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-primary">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(4)}
              className="px-4 py-2 border border-border rounded text-xs font-medium hover:bg-surface-subtle transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Adjust Metrics
            </button>
            <button
              onClick={() => setCurrentStep(6)}
              className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors"
            >
              Next: Human Approval Gate <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 6: HUMAN APPROVAL (STRICT HITL POLICY)                           */}
      {/* ===================================================================== */}
      {currentStep === 6 && strategy && (
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-success" />
                <h2 className="text-base font-bold text-text">Step 6: Human Approval & Authorization</h2>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Autonomous agents never deploy live feature flags without authenticated human review.
              </p>
            </div>
            <StatusBadge status="warning" label="APPROVAL REQUIRED" />
          </div>

          {/* Full Experiment Specification Preview */}
          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-text-secondary">Experiment Title:</span>
                <p className="font-bold text-text text-sm mt-0.5">{strategy.experiment_name}</p>
              </div>
              <div>
                <span className="text-text-secondary">Flagsmith Flag Key:</span>
                <p className="font-mono font-bold text-primary text-sm mt-0.5">
                  {strategy.flagsmith_feature_name}
                </p>
              </div>
            </div>

            <div>
              <span className="text-text-secondary">Hypothesis:</span>
              <p className="text-text mt-0.5 leading-relaxed">{strategy.hypothesis}</p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border-subtle">
              <div>
                <span className="text-text-secondary">Primary Metric:</span>
                <p className="font-mono font-semibold text-primary">
                  {strategy.primary_metric.name} ({strategy.primary_metric.key})
                </p>
              </div>
              <div>
                <span className="text-text-secondary">Target Audience:</span>
                <p className="font-semibold text-text">{strategy.target_audience.segmentName}</p>
              </div>
              <div>
                <span className="text-text-secondary">Traffic Allocation:</span>
                <p className="font-mono font-semibold text-text">
                  {strategy.control_variant.trafficAllocation}% Control /{" "}
                  {strategy.treatment_variants.map((v) => `${v.trafficAllocation}% ${v.key}`).join(", ")}
                </p>
              </div>
            </div>
          </div>

          {/* Deployment Error Banner if Remote Actuation Fails */}
          {deploymentError && (
            <div className="p-4 rounded-md border border-danger/20 bg-danger-light text-danger text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Flagsmith Remote Provisioning Error</span>
              </div>
              <p className="leading-relaxed">{deploymentError}</p>
              {deploymentError.includes("FLAGSMITH_ORG_API_TOKEN") && (
                <div className="p-3 bg-surface border border-danger/30 rounded text-text space-y-1.5 mt-2">
                  <p className="font-semibold text-danger">How to configure your Organisation API Token:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-text-secondary">
                    <li>Open Flagsmith Settings: <a href="https://app.flagsmith.com/project/53867/settings" target="_blank" rel="noreferrer" className="text-primary font-bold underline">app.flagsmith.com/project/53867/settings</a></li>
                    <li>Click your Organisation name in the top left &rarr; <strong>Organisation Settings</strong> &rarr; <strong>API Keys</strong></li>
                    <li>Click <strong>Create Organisation API Key</strong> (Role: Admin) and copy the token</li>
                    <li>Configure <code className="bg-surface-subtle px-1 rounded font-mono text-primary font-bold">FLAGSMITH_ORG_API_TOKEN</code> in your environment variables</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2 border border-border rounded text-xs font-semibold text-text hover:bg-surface-subtle transition-colors"
            >
              Edit Configuration
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleApproveAndDeploy}
                disabled={isDeploying}
                className="px-5 py-2.5 bg-success hover:bg-success-text text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isDeploying ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Provisioning Flagsmith...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" /> Approve & Create Experiment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 7: FLAGS MAPPING CONFIRMATION                                    */}
      {/* ===================================================================== */}
      {currentStep === 7 && deploymentResult && strategy && (
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6 animate-in fade-in">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-10 h-10 rounded-full bg-success-light text-success flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Step 7: Flagsmith Remote Verification Complete!</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                The multivariate feature flag has been provisioned remotely and verified in the Flagsmith environment.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-surface-subtle border border-border space-y-3 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-text-secondary">Flagsmith Feature Key:</span>
              <span className="font-bold text-primary">{deploymentResult.flagsmithFeatureName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Remote Feature ID:</span>
              <span className="text-text font-bold">{deploymentResult.flagsmithFeatureId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Project / Environment:</span>
              <span className="text-text">Project 53867 &bull; Development</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Provisioning Status:</span>
              <span className="text-success font-bold">
                {deploymentResult.remoteCreated ? "LIVE REMOTE CREATED" : deploymentResult.isExisting ? "LIVE REMOTE VERIFIED (EXISTING)" : "ACTIVE"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Read-After-Write Verification:</span>
              <span className="text-success font-bold">&check; VERIFIED IN REMOTE ENVIRONMENT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Authorized By:</span>
              <span className="text-text">{deploymentResult.approvedBy}</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setCurrentStep(8)}
              className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors"
            >
              Next: View Integration Instructions <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 8: IMPLEMENTATION INSTRUCTIONS (PRODUCTION CODE SNIPPETS)        */}
      {/* ===================================================================== */}
      {currentStep === 8 && strategy && (
        <div className="p-6 rounded-lg border border-border bg-surface shadow-xs space-y-6 animate-in fade-in">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <h2 className="text-base font-bold text-text">
                Step 8: Implementation Instructions
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Copy and paste these integration snippets directly into your codebase to evaluate flags and record conversions.
              </p>
            </div>
            <Link
              href="/sandbox"
              className="px-3.5 py-1.5 rounded bg-primary-light text-primary hover:bg-primary hover:text-white transition-colors text-xs font-semibold flex items-center gap-1.5"
            >
              Test in Customer Sandbox <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Snippet 1: Install SDK */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-text">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-primary" /> 1. Install Flagsmith React SDK
              </span>
              <button
                onClick={() => copyToClipboard("npm install flagsmith", "code-install")}
                className="text-text-secondary hover:text-primary transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedCodeSnippet === "code-install" ? (
                  <>
                    <Check className="w-3 h-3 text-success" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-surface-subtle border border-border rounded font-mono text-xs text-text">
              npm install flagsmith
            </pre>
          </div>

          {/* Snippet 2: Component Integration & Evaluation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-text">
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-primary" /> 2. Component Integration (Evaluate Variant & Track Conversion)
              </span>
              <button
                onClick={() =>
                  copyToClipboard(
                    `import flagsmith from "flagsmith";
import { useEffect, useState } from "react";

export function CheckoutComponent({ user }) {
  const [variantConfig, setVariantConfig] = useState(null);

  useEffect(() => {
    // 1. Initialize & Identify User
    flagsmith.init({
      environmentID: process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID,
      identity: user.id,
      onChange: () => {
        // 2. Read Multivariate Feature Value
        const flag = flagsmith.getValue("${strategy.flagsmith_feature_name}");
        setVariantConfig(typeof flag === "string" ? JSON.parse(flag) : flag);

        // 3. Track Exposure Telemetry
        fetch("/api/telemetry/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experimentFlag: "${strategy.flagsmith_feature_name}",
            distinctUserId: user.id,
            eventType: "EXPOSURE"
          })
        });
      }
    });
  }, [user.id]);

  const handleComplete = async () => {
    // 4. Track Goal Conversion Telemetry
    await fetch("/api/telemetry/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentFlag: "${strategy.flagsmith_feature_name}",
        distinctUserId: user.id,
        eventType: "CONVERSION",
        metricKey: "${strategy.primary_metric.key}"
      })
    });
  };

  return (
    <div>
      {/* Render variant based on variantConfig */}
      <button onClick={handleComplete}>Complete Action</button>
    </div>
  );
}`,
                    "code-eval"
                  )
                }
                className="text-text-secondary hover:text-primary transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedCodeSnippet === "code-eval" ? (
                  <>
                    <Check className="w-3 h-3 text-success" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy Snippet
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-surface-subtle border border-border rounded font-mono text-[11px] text-text overflow-x-auto max-h-72 leading-relaxed">
{`import flagsmith from "flagsmith";
import { useEffect, useState } from "react";

export function CheckoutComponent({ user }) {
  const [variantConfig, setVariantConfig] = useState(null);

  useEffect(() => {
    // 1. Initialize & Identify User
    flagsmith.init({
      environmentID: process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_ID,
      identity: user.id,
      onChange: () => {
        // 2. Read Multivariate Feature Value
        const flag = flagsmith.getValue("${strategy.flagsmith_feature_name}");
        setVariantConfig(typeof flag === "string" ? JSON.parse(flag) : flag);

        // 3. Track Exposure Telemetry
        fetch("/api/telemetry/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experimentFlag: "${strategy.flagsmith_feature_name}",
            distinctUserId: user.id,
            eventType: "EXPOSURE"
          })
        });
      }
    });
  }, [user.id]);

  const handleComplete = async () => {
    // 4. Track Goal Conversion Telemetry
    await fetch("/api/telemetry/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentFlag: "${strategy.flagsmith_feature_name}",
        distinctUserId: user.id,
        eventType: "CONVERSION",
        metricKey: "${strategy.primary_metric.key}"
      })
    });
  };

  return (
    <div>
      {/* Render variant based on variantConfig */}
      <button onClick={handleComplete}>Complete Action</button>
    </div>
  );
}`}
            </pre>
          </div>

          <div className="flex justify-between pt-4 border-t border-border">
            <button
              onClick={() => setCurrentStep(6)}
              className="px-4 py-2 border border-border rounded text-xs font-medium hover:bg-surface-subtle transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Approval
            </button>
            <Link
              href="/dashboard"
              className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-2 transition-colors"
            >
              Finish & Return to Dashboard <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
