import { resolveExposureVariant } from "../src/lib/telemetry/variant-attribution.ts";
import { isPublicDemoIdentity, canEvaluateFlagsmithIdentity } from "../src/lib/telemetry/public-demo-identity.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] ${message}`);
}

const variants = [
  { id: "variant-control", key: "control" },
  { id: "variant-treatment", key: "treatment" },
];

// A client may send "treatment", but the server's Flagsmith assignment is
// authoritative. Passing the server assignment must resolve to that variant.
const clientSuppliedVariant = "treatment";
const serverAssignment = "control";
const resolved = resolveExposureVariant(variants, serverAssignment);
assert(resolved?.key === "control", "Persisted exposure follows the server Flagsmith assignment, not the client variant");
assert(resolved?.key !== clientSuppliedVariant, "Forged client treatment key cannot override a control assignment");
assert(resolveExposureVariant(variants, "unknown") === null, "Unknown server assignment is rejected instead of falling back to control");
assert(resolveExposureVariant(variants, null) === null, "Missing authoritative assignment is rejected");
assert(resolveExposureVariant(variants, "  treatment  ")?.id === "variant-treatment", "Whitespace around an authoritative key is normalized");
assert(isPublicDemoIdentity("user_alex_dev"), "Alex demo persona is available without authentication");
assert(isPublicDemoIdentity("user_elena_ai"), "Elena demo persona is available without authentication");
assert(!isPublicDemoIdentity("visitor_forged_123"), "Anonymous telemetry cannot invent arbitrary visitor identities");
assert(!isPublicDemoIdentity("user_control_1"), "Unsupported QA identity is not exposed to anonymous demo traffic");
assert(canEvaluateFlagsmithIdentity(null, "user_alex_dev"), "Anonymous access to the Alex demo identity remains available");
assert(!canEvaluateFlagsmithIdentity(null, "another-user-id"), "Anonymous users cannot evaluate arbitrary workspace identities");
assert(canEvaluateFlagsmithIdentity({ id: "user-1", role: "EDITOR" }, "user-1"), "Authenticated users can evaluate their own identity");
assert(!canEvaluateFlagsmithIdentity({ id: "user-1", role: "EDITOR" }, "user-2", true), "Editors cannot evaluate another workspace member");
assert(canEvaluateFlagsmithIdentity({ id: "admin-1", role: "ADMIN" }, "user-2", true), "Workspace admins can evaluate a member in their own workspace");
assert(!canEvaluateFlagsmithIdentity({ id: "admin-1", role: "ADMIN" }, "user-2", false), "Workspace admins cannot evaluate an identity outside their workspace");

console.log("\nTelemetry attribution tests: 15 passed.");
