/**
 * Security & Input Sanitization Engine
 * PulsePilot AI — Anti-Prompt Injection, Anti-XSS, and Untrusted Input Scrubbing
 */

const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions|directives|prompts)/i,
  /disregard\s+(all\s+)?(safety|system)\s+(guidelines|instructions)/i,
  /system\s+prompt\s*[:=]/i,
  /you\s+are\s+now\s+(in\s+)?(developer\s+mode|dan|jailbreak)/i,
  /reveal\s+(your\s+)?(api[_\s-]?keys?|environment\s+variables?|secrets?)/i,
  /print\s+(process\.env|credentials)/i,
  /bypass\s+(human[_\s-]?approval|guardrails?|checks?)/i,
  /<script\b[^>]*>([\s\S]*?)<\/script>/i,
  /javascript\s*:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
];

export interface SanitizationResult {
  sanitized: string;
  isFlagged: boolean;
  detectedThreats: string[];
}

/**
 * Strips HTML tags, neutralizes script execution vectors, and detects prompt injection attempts.
 */
export function sanitizeUserInput(input: string, maxLen = 4000): SanitizationResult {
  if (!input || typeof input !== "string") {
    return { sanitized: "", isFlagged: false, detectedThreats: [] };
  }

  // Truncate overly long payloads (prevent buffer exhaustion)
  let clean = input.slice(0, maxLen).trim();
  const detectedThreats: string[] = [];

  // Check for prompt injection / XSS patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(clean)) {
      detectedThreats.push(`Pattern detected: ${pattern.source}`);
      // Neutralize matched pattern
      clean = clean.replace(pattern, "[BLOCKED_SUSPICIOUS_PAYLOAD]");
    }
  }

  // Basic HTML entity escaping to prevent stored XSS
  clean = clean
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

  return {
    sanitized: clean,
    isFlagged: detectedThreats.length > 0,
    detectedThreats,
  };
}

/**
 * Validates that an agent's structured response does not leak server secrets.
 * Uses both pattern matching and exact in-memory credential comparison.
 * Never prints discovered secrets in error messages or logs.
 */
export function assertZeroSecretLeakage(responseObj: any): boolean {
  const serialized = typeof responseObj === "string" ? responseObj : JSON.stringify(responseObj);

  // 1. Structural Secret Regex Patterns
  const forbiddenPatterns: { name: string; regex: RegExp }[] = [
    { name: "Google AI Studio Key (AQ pattern)", regex: /AQ\.[A-Za-z0-9_-]{20,}/ },
    { name: "Google API Key (AIza pattern)", regex: /AIza[0-9A-Za-z_-]{20,}/ },
    { name: "Flagsmith Server Environment Key (ser pattern)", regex: /ser\.[A-Za-z0-9_-]{15,}/ },
    { name: "Flagsmith Server Key (sb pattern)", regex: /sb\.[A-Za-z0-9_-]{15,}/ },
    { name: "Database Connection URI", regex: /postgres(ql)?:\/\/[^:]+:[^@]+@/i },
    { name: "JWT Token Pattern", regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
    { name: "Secret Variable Name Leakage: FLAGSMITH_MANAGEMENT_KEY", regex: /FLAGSMITH_MANAGEMENT_KEY/i },
    { name: "Secret Variable Name Leakage: FLAGSMITH_ORG_API_TOKEN", regex: /FLAGSMITH_ORG_API_TOKEN/i },
    { name: "Secret Variable Name Leakage: GEMINI_API_KEY", regex: /GEMINI_API_KEY/i },
    { name: "Secret Variable Name Leakage: SUPABASE_SERVICE_ROLE_KEY", regex: /SUPABASE_SERVICE_ROLE/i },
  ];

  for (const { name, regex } of forbiddenPatterns) {
    if (regex.test(serialized)) {
      throw new Error(`CRITICAL SECURITY ALERT: Secret pattern '${name}' detected in output payload.`);
    }
  }

  // 2. Exact Memory Matching Against Configured Private Environment Variables
  const sensitiveEnvVars = [
    "GEMINI_API_KEY",
    "FLAGSMITH_ORG_API_TOKEN",
    "FLAGSMITH_SERVER_SIDE_API_KEY",
    "FLAGSMITH_MANAGEMENT_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "DIRECT_URL",
    "NEXTAUTH_SECRET",
  ];

  for (const varName of sensitiveEnvVars) {
    const secretVal = process.env[varName];
    if (secretVal && secretVal.length >= 8 && secretVal !== "mock") {
      if (serialized.includes(secretVal)) {
        throw new Error(
          `CRITICAL SECURITY ALERT: Private credential from environment variable '${varName}' was detected in serialized output payload.`
        );
      }
    }
  }

  return true;
}
