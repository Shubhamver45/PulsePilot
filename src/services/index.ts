/**
 * PulsePilot AI — Client & Server Services
 */

export const experimentService = {
  async getDashboardData(range = "7D") {
    const res = await fetch(`/api/dashboard?range=${range}`);
    if (!res.ok) throw new Error("Failed to fetch dashboard data");
    return res.json();
  },

  async formulateExperiment(objective: string, prompt: string) {
    const res = await fetch("/api/agent/formulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective, prompt }),
    });
    if (!res.ok) throw new Error("Failed to formulate experiment");
    return res.json();
  },

  async getFlagsmithHealth() {
    const res = await fetch("/api/flagsmith/health");
    if (!res.ok) throw new Error("Failed to check Flagsmith health");
    return res.json();
  },
};

export const releaseService = {
  async promoteCanary(experimentId: string, stagePercent: number) {
    const res = await fetch("/api/flagsmith/rollout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId, percentage: stagePercent }),
    });
    if (!res.ok) throw new Error("Failed to promote canary");
    return res.json();
  },

  async executeEmergencyRollback(experimentId: string, reason: string) {
    const res = await fetch("/api/flagsmith/rollout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId, percentage: 0, reason, action: "ROLLBACK" }),
    });
    if (!res.ok) throw new Error("Failed to execute rollback");
    return res.json();
  },
};

