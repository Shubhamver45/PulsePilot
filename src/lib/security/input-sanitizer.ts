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
 * Validates that an agent's structured response does not leak server secrets
 */
export function assertZeroSecretLeakage(responseObj: any): boolean {
  const serialized = JSON.stringify(responseObj);
  const forbiddenPatterns = [
    /FLAGSMITH_MANAGEMENT_KEY/i,
    /GEMINI_API_KEY/i,
    /DATABASE_URL/i,
    /SUPABASE_SERVICE_ROLE/i,
    /AIzaSy[A-Za-z0-9_-]{33}/, // Google API Key regex
    /postgres:\/\/[^:]+:[^@]+@/, // Database connection string
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) {
      throw new Error(`CRITICAL SECURITY ALERT: Secret pattern '${pattern.source}' detected in output payload.`);
    }
  }

  return true;
}
