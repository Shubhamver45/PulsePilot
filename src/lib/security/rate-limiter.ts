/**
 * Sliding Window Rate Limiter
 * PulsePilot AI — Anti-DoS & API Quota Protection
 */

interface RateLimitRecord {
  timestamps: number[];
}

const RATE_LIMIT_STORE = new Map<string, RateLimitRecord>();

export interface RateLimitOptions {
  windowMs?: number; // e.g. 60,000 ms (1 minute)
  maxRequests?: number; // e.g. 60 requests per window
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; resetMs: number } {
  const windowMs = options.windowMs || 60000;
  const maxRequests = options.maxRequests || 60;
  const now = Date.now();

  const record = RATE_LIMIT_STORE.get(identifier) || { timestamps: [] };

  // Filter out timestamps outside the active window
  const activeTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxRequests) {
    const oldest = activeTimestamps[0];
    const resetMs = windowMs - (now - oldest);
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  activeTimestamps.push(now);
  RATE_LIMIT_STORE.set(identifier, { timestamps: activeTimestamps });

  // Cleanup old keys occasionally
  if (RATE_LIMIT_STORE.size > 5000) {
    for (const [key, val] of Array.from(RATE_LIMIT_STORE.entries())) {
      if (val.timestamps.length === 0 || now - val.timestamps[val.timestamps.length - 1] > windowMs) {
        RATE_LIMIT_STORE.delete(key);
      }
    }
  }

  return {
    allowed: true,
    remaining: maxRequests - activeTimestamps.length,
    resetMs: windowMs,
  };
}
