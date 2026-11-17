import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "prisma/migrations/20261117194500_fail_closed_tenant_rls/migration.sql",
  "utf8"
);
const proposalService = readFileSync("src/lib/flagsmith/proposal-service.ts", "utf8");
const workspaceRoute = readFileSync("src/app/api/workspaces/route.ts", "utf8");
const loginRoute = readFileSync("src/app/api/auth/login/route.ts", "utf8");
const prismaHelper = readFileSync("src/lib/db/prisma.ts", "utf8");
const tables = [
  "organizations", "users", "projects", "experiments", "experiment_variants",
  "metrics", "telemetry_events", "agent_runs", "audit_logs", "experiment_proposals",
];
for (const table of tables) {
  const policy = table === "experiment_variants"
    ? "pulsepilot_app_experiment_variants_isolation"
    : "pulsepilot_app_" + table + "_isolation";
  assert.ok(migration.includes(policy), "Missing tenant RLS policy: " + table);
}
assert.ok(!/IS NULL\s+OR/i.test(migration), "RLS migration must not fail open");
assert.ok(migration.includes("organization_id = NULLIF(current_setting"), "Proposal RLS must enforce tenant owner");
assert.ok(prismaHelper.includes("set_config('app.current_organization_id'"), "Tenant context must be transaction-local");
assert.ok(proposalService.includes("tenantScopedPrisma"), "Proposal service must use scoped Prisma access");
assert.ok(proposalService.includes("organizationId: proposingUser.organizationId"), "Proposal records must persist their tenant");
assert.ok(!proposalService.includes("prisma.experimentProposal."), "Unscoped proposal queries are forbidden");
assert.ok(workspaceRoute.includes('error: "UNAUTHORIZED"'), "Workspace mutation must require authentication");
assert.ok(workspaceRoute.includes("user.organizationId"), "Workspace creation must use authenticated organization");
assert.ok(!workspaceRoute.includes("body.organizationId"), "Workspace tenant cannot be caller-supplied");
assert.ok(loginRoute.includes("ACCOUNT_NOT_PROVISIONED"), "Unprovisioned user must be denied");
assert.ok(!loginRoute.includes("user_metadata?.role"), "User-editable metadata must not grant roles");
assert.ok(!loginRoute.includes('|| "ADMIN"'), "Login must not grant implicit administrator");
console.log("RLS/auth/workspace static security gates passed.");
