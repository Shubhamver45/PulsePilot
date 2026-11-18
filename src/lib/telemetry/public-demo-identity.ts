const PUBLIC_DEMO_IDENTITIES = new Set(["user_alex_dev", "user_elena_ai"]);

/** Anonymous access is restricted to the two first-party demo personas. */
export function isPublicDemoIdentity(identity: string): boolean {
  return PUBLIC_DEMO_IDENTITIES.has(identity);
}
