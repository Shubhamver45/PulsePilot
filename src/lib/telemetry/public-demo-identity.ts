const PUBLIC_DEMO_IDENTITIES = new Set(["user_alex_dev", "user_elena_ai"]);

/** Anonymous access is restricted to the two first-party demo personas. */
export function isPublicDemoIdentity(identity: string): boolean {
  return PUBLIC_DEMO_IDENTITIES.has(identity);
}

/**
 * Public demo personas are intentionally readable without a workspace session.
 * All other identities are scoped to the authenticated user, or to users in
 * the same workspace when the requester is an ADMIN.
 */
export function canEvaluateFlagsmithIdentity(
  actor: { id: string; role: string } | null,
  targetIdentity: string,
  targetBelongsToWorkspace = false
): boolean {
  if (isPublicDemoIdentity(targetIdentity)) return true;
  if (!actor) return false;
  if (actor.id === targetIdentity) return true;
  return actor.role === "ADMIN" && targetBelongsToWorkspace;
}
