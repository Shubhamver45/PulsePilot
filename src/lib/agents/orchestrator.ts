import { GoogleGenerativeAI } from "@google/generative-ai";
import { ORCHESTRATOR_ROUTER_SYSTEM_PROMPT } from "./prompts/router.prompt";
import {
  AgentRole,
  OrchestratorResponse,
  OrchestratorRouting,
  OrchestratorRoutingSchema,
} from "./schemas";
import { runStrategyAgent } from "./strategy-agent";
import { runExperimentBuilderAgent } from "./experiment-builder-agent";
import { runAnalyticsAgent } from "./analytics-agent";
import { runReleaseGuardianAgent } from "./release-guardian-agent";
import { runGrowthAdvisorAgent } from "./growth-advisor-agent";
import { recordAuditLog } from "@/lib/audit/audit-logger";

const AGENT_FRIENDLY_NAMES: Record<AgentRole, string> = {
  STRATEGY_AGENT: "Hypothesis Architect",
  EXPERIMENT_BUILDER_AGENT: "Experiment Builder Agent",
  ANALYTICS_AGENT: "Statistical Analyst",
  RELEASE_GUARDIAN_AGENT: "Release Guardian Agent",
  GROWTH_ADVISOR_AGENT: "Growth Advisor Agent",
};

/**
 * Routes user prompt to the correct specialist agent using Gemini routing prompt
 * or deterministic intent matching.
 */
export async function routeUserPrompt(userPrompt: string): Promise<OrchestratorRouting> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey !== "mock") {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const result = await model.generateContent([
        ORCHESTRATOR_ROUTER_SYSTEM_PROMPT,
        `User Prompt to Route: "${userPrompt}"`,
      ]);

      const json = JSON.parse(result.response.text());
      return OrchestratorRoutingSchema.parse(json);
    } catch (err) {
      console.warn("Orchestrator routing fallback to local intent matcher:", err);
    }
  }

  // Deterministic Intent Classifier
  const p = userPrompt.toLowerCase();

  if (p.includes("rollout") || p.includes("rollback") || p.includes("guardrail") || p.includes("kill switch")) {
    return {
      selectedAgent: "RELEASE_GUARDIAN_AGENT",
      userIntent: "Evaluate guardrails or prepare rollout/rollback plan",
      confidence: 0.98,
      reasoning: "Prompt mentions release safety, rollout or rollback keywords.",
      extractedEntities: { experimentNameOrFlag: "exp_checkout_social_proof" },
    };
  }

  if (
    p.includes("analyse") ||
    p.includes("analyze") ||
    p.includes("performing better") ||
    p.includes("significance") ||
    p.includes("p-value") ||
    p.includes("confidence") ||
    p.includes("variant b")
  ) {
    return {
      selectedAgent: "ANALYTICS_AGENT",
      userIntent: "Inspect statistical results, conversion metrics, and confidence",
      confidence: 0.97,
      reasoning: "Prompt requests statistical analysis or variant comparison.",
      extractedEntities: { variantKey: "variant_b" },
    };
  }

  if (p.includes("opportunit") || p.includes("learn") || p.includes("growth") || p.includes("macro") || p.includes("advice")) {
    return {
      selectedAgent: "GROWTH_ADVISOR_AGENT",
      userIntent: "Discover growth opportunities, takeaways, and follow-up experiments",
      confidence: 0.95,
      reasoning: "Prompt seeks strategic recommendations and growth findings.",
      extractedEntities: {},
    };
  }

  if (p.includes("build") || p.includes("flagsmith") || p.includes("instruction") || p.includes("code snippet") || p.includes("patch")) {
    return {
      selectedAgent: "EXPERIMENT_BUILDER_AGENT",
      userIntent: "Generate Flagsmith configuration and code integration patch",
      confidence: 0.94,
      reasoning: "Prompt refers to implementation and feature flag building.",
      extractedEntities: {},
    };
  }

  // Default to Strategy Agent for creation / ideation
  return {
    selectedAgent: "STRATEGY_AGENT",
    userIntent: "Formulate a new experiment hypothesis and variant design",
    confidence: 0.92,
    reasoning: "Prompt implies experiment creation or optimization goal.",
    extractedEntities: {},
  };
}

/**
 * Master Orchestrator: Dispatches to the appropriate agent, logs audit trail,
 * measures latency, and returns consolidated response.
 */
export async function orchestrateAgentRequest(
  userPrompt: string,
  context?: Record<string, any>
): Promise<OrchestratorResponse> {
  const startTime = Date.now();
  const orchestrationId = `orch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    // 1. Route Prompt
    const routing = await routeUserPrompt(userPrompt);
    const agentRole = routing.selectedAgent;

    // 2. Execute Specialist Agent
    let agentResult: any;
    switch (agentRole) {
      case "STRATEGY_AGENT":
        agentResult = await runStrategyAgent(userPrompt, context);
        break;
      case "EXPERIMENT_BUILDER_AGENT":
        agentResult = await runExperimentBuilderAgent(userPrompt, context);
        break;
      case "ANALYTICS_AGENT":
        agentResult = await runAnalyticsAgent(userPrompt, context);
        break;
      case "RELEASE_GUARDIAN_AGENT":
        agentResult = await runReleaseGuardianAgent(userPrompt, context);
        break;
      case "GROWTH_ADVISOR_AGENT":
        agentResult = await runGrowthAdvisorAgent(userPrompt, context);
        break;
      default:
        agentResult = await runStrategyAgent(userPrompt, context);
    }

    const executionTimeMs = Date.now() - startTime;

    // 3. Log Audit Trail
    await recordAuditLog({
      action: "EXPERIMENT_CREATED",
      actor: { name: AGENT_FRIENDLY_NAMES[agentRole], type: "agent" },
      entityType: "EXPERIMENT",
      entityId: orchestrationId,
      details: `Orchestrator dispatched '${userPrompt}' to ${AGENT_FRIENDLY_NAMES[agentRole]} (${executionTimeMs}ms).`,
      metadata: { routing, executionTimeMs },
    });

    return {
      orchestrationId,
      timestamp: new Date().toISOString(),
      inputPrompt: userPrompt,
      routedAgent: agentRole,
      agentName: AGENT_FRIENDLY_NAMES[agentRole],
      executionTimeMs,
      status: "SUCCESS",
      data: agentResult,
    };
  } catch (error: any) {
    const executionTimeMs = Date.now() - startTime;
    return {
      orchestrationId,
      timestamp: new Date().toISOString(),
      inputPrompt: userPrompt,
      routedAgent: "UNKNOWN",
      agentName: "Orchestrator Error Handler",
      executionTimeMs,
      status: "ERROR",
      error: error.message || "An unexpected error occurred during multi-agent orchestration.",
      data: {},
    };
  }
}

