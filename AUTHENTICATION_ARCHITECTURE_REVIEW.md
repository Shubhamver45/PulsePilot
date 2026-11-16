# PULSEpilot AI — Authentication Architecture Review & Serverless Hardening
## Technical Specification for Session Persistence, RBAC Enforcement, and Flagsmith Rollout Security

**Document Version:** 2.0.0 (Remediation Architecture V2)  
**Security Domain:** Next.js Authentication Architecture, Serverless Ephemeral State, & Remote Actuation Authorization  
**Affected Source Files:**
- `src/lib/auth/auth-service.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/flagsmith/rollout/route.ts`
- `src/components/layout/TopNavigation.tsx`
- `src/app/release-center/page.tsx`

---

## 1. Inspection of Existing Authentication Implementation

### 1.1 How Sessions are Created, Stored, and Verified Today
The application's authentication system resides in `src/lib/auth/auth-service.ts`:

```typescript
// src/lib/auth/auth-service.ts (Lines 31-34)
const USERS_STORE: Map<string, { user: AuthUser; passwordHash: string }> = new Map();
const SESSIONS_STORE: Map<string, { userId: string; expiresAt: number }> = new Map();
const WORKSPACES_STORE: Map<string, Workspace> = new Map();
```

1. **Session Creation (`loginUser`, Lines 248–252):**
   ```typescript
   const token = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
   SESSIONS_STORE.set(token, {
     userId: entry.user.id,
     expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
   });
   return { success: true, user: entry.user, token };
   ```
2. **Cookie Setting (`src/app/api/auth/login/route.ts`, Lines 21–28):**
   ```typescript
   response.cookies.set("pulsepilot_session", result.token || "", {
     httpOnly: true,
     secure: process.env.NODE_ENV === "production",
     sameSite: "lax",
     maxAge: 60 * 60 * 24 * 7,
     path: "/",
   });
   ```
3. **Session Verification (`getUserFromToken`, Lines 260–273):**
   ```typescript
   export async function getUserFromToken(token: string): Promise<AuthUser | null> {
     const session = SESSIONS_STORE.get(token);
     if (!session || session.expiresAt < Date.now()) {
       return null;
     }
     for (const entry of Array.from(USERS_STORE.values())) {
       if (entry.user.id === session.userId) {
         return entry.user;
       }
     }
     return null;
   }
   ```

---

## 2. The Serverless Ephemeral State Vulnerability

### 2.1 The Failure Mode on Vercel
On Vercel, Next.js API routes run inside **stateless, ephemeral AWS Lambda serverless containers**:
- Each serverless container has its own private heap and isolated process memory.
- There is **zero memory sharing** between concurrent serverless instances.
- Containers scale up on traffic bursts and spin down on idle (cold starts).

### 2.2 Concrete Attack & Failure Scenarios
1. **Container Isolation Failure:**
   - User logs in via `POST /api/auth/login`. Request is handled by **Container A**. `SESSIONS_STORE` in Container A records token `sess_123`.
   - User navigates to `/release-center` and clicks *"Approve 100% Rollout"*. The browser sends `POST /api/flagsmith/rollout` with cookie `pulsepilot_session=sess_123`.
   - Vercel routes this second request to **Container B**.
   - Container B reads its local `SESSIONS_STORE.get("sess_123")` $\to$ **returns `undefined`**.
   - Result: Legitimate administrator actions are randomly rejected with `HTTP 401 Unauthorized`.
2. **Cold Start Data Loss:**
   - Whenever a container scales down after inactivity, all session tokens in memory are permanently erased.
3. **Unauthenticated Rollout Flaw (SEC-03):**
   Because developers recognized the in-memory store was fragile, `/api/flagsmith/rollout` was implemented **without any authentication check whatsoever**, accepting an unvalidated `authorizer` string from the request body. Anyone on the public internet can trigger emergency kill-switches, ramp traffic, or declare experiment winners remotely.

---

## 3. Investigation of Existing Authentication Dependencies

An inspection of `package.json` reveals the following installed dependencies:

```json
{
  "dependencies": {
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.49.1",
    "@prisma/client": "^6.4.1",
    "zod": "^3.24.2"
  }
}
```

No external authentication libraries (e.g., NextAuth, Lucia, iron-session, jose) are installed.  
However, the project **already possesses two enterprise-grade authentication foundations**:

### Foundation 1: Supabase Auth via `@supabase/ssr` (Installed)
- `@supabase/ssr` is already utilized in `src/app/auth/callback/route.ts`.
- `@supabase/supabase-js` is used in `src/app/api/auth/register/route.ts` to create accounts via `supabaseAdmin.auth.admin.createUser`.
- Supabase Auth issues cryptographic JWT access tokens containing standard claims (`sub`, `email`, `aud`, `exp`, `iss`).
- Tokens are automatically refreshed and verified statelessly using public-key cryptography (RS256/ES256) or the Supabase project JWT secret (HS256).

### Foundation 2: Node.js Built-in `crypto` HMAC-SHA256 Stateless Tokens
- Built into the standard Node.js runtime (`crypto.createHmac`, `crypto.timingSafeEqual`).
- Requires zero network calls to Supabase and zero database lookups for token signature verification.
- Completely immune to serverless cold starts and multi-container routing.

---

## 4. Architectural Comparison: Options for Session Persistence

| Metric / Dimension | Option A: Supabase Auth SSR (`@supabase/ssr`) | Option B: Stateless HMAC-SHA256 Token | Option C: Prisma PostgreSQL `sessions` Table |
| :--- | :--- | :--- | :--- |
| **Persistence Mechanism** | Supabase Auth Cloud + HTTP Cookie | Signed Cookie (`pps_<payload>.<signature>`) | Row in PostgreSQL `sessions` table |
| **Serverless Compatibility** | **100% (Stateless JWT verification)** | **100% (Stateless HMAC verification)** | 100% (Shared PostgreSQL state) |
| **Network Overhead** | 1 remote call to Supabase or local JWT verify | **0 remote calls (Local CPU microsecond)** | 1 database round-trip per request |
| **External Dependencies** | Uses installed `@supabase/ssr` | **Native Node.js `crypto` (Zero deps)** | Requires Prisma schema migration |
| **Cold-Start Resilience** | Fully resilient | Fully resilient | Fully resilient |
| **Prerequisites** | Requires active Supabase project credentials | Requires `SESSION_SECRET` env var | Requires running `prisma migrate` |

### Architectural Recommendation:
1. **Primary Session Layer:** Implement **Option B (Stateless HMAC-SHA256 Tokens)** in `src/lib/auth/auth-service.ts`. This immediately resolves the serverless multi-instance bug without requiring database migrations or external cloud credentials.
2. **Supabase Auth Bridge:** When `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured, validate Supabase Auth JWTs alongside Option B, providing full enterprise identity federation.

---

## 5. Rollout Endpoint Specification (`/api/flagsmith/rollout`)

To fully remediate **SEC-03**, `src/app/api/flagsmith/rollout/route.ts` must be refactored to enforce the following 11 security controls:

### Control 1: Server-Side Identity Verification
- Extract the session token from either:
  1. The `pulsepilot_session` HTTP-only cookie.
  2. The `Authorization: Bearer <token>` header (for automated CI/CD and integration scripts).

### Control 2: Cryptographic Signature & Expiry Validation
- Verify that the token was signed with `SESSION_SECRET` using constant-time comparison (`crypto.timingSafeEqual`).
- Check that `expiresAt > Date.now()`. Reject expired tokens with `HTTP 401 Unauthorized`.

### Control 3: Strict RBAC Authorization (`role === "ADMIN"`)
- Inspect the authenticated user's role:
  - If role is `"ADMIN"`, allow the action.
  - If role is `"EDITOR"` or `"VIEWER"`, reject with `HTTP 403 Forbidden` (`INSUFFICIENT_PERMISSIONS: Production flag mutations require an authenticated Administrator role`).

### Control 4: CSRF Protection on Cookie-Based Mutating Requests
- When authentication originates from browser cookies, verify either:
  1. The presence of a custom header (`X-Requested-With: XMLHttpRequest` or `Content-Type: application/json`).
  2. The `Origin` or `Referer` header matches the trusted application origin (`ALLOWED_ORIGINS` or `request.headers.get("origin") === host`).
- This blocks cross-origin form submission and clickjacking attempts.

### Control 5: Removal of Client-Provided `authorizer`
- **Strict Rule:** Delete `authorizer` from `RolloutRequestSchema`. Never accept a human identity from the client request body.
- Bind the authorizer identity strictly to the authenticated session:
  ```typescript
  const verifiedAuthorizer = `${user.fullName} (${user.role} - ${user.email})`;
  ```

### Control 6: Strict Zod Request Validation
```typescript
const RolloutRequestSchema = z.object({
  flagsmithFeatureName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  action: z.enum([
    "ROLLOUT_WINNER",
    "GRADUAL_STAGE",
    "ROLLBACK_TO_CONTROL",
    "EMERGENCY_KILL_SWITCH",
  ]),
  winningVariantKey: z.string().min(1).max(50).optional(),
  stagePercentage: z.number().int().min(0).max(100).optional(),
  rationale: z.string().min(5).max(500),
});
```

### Control 7: Server-Side Flagsmith Credentials Check
- Ensure that `FLAGSMITH_MANAGEMENT_KEY` or `FLAGSMITH_SERVER_SIDE_API_KEY` is loaded from server environment variables.
- Never accept Flagsmith keys from client requests.

### Control 8: Cryptographic Audit Attribution
- Record the mutation in `audit_logs` attributing the action to `verifiedAuthorizer` with `actorType = "human"`.
- If the remote mutation fails, record an explicit failure event in the audit chain.

---

## 6. Proposed Code Specification for `/api/flagsmith/rollout/route.ts`

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromToken } from "@/lib/auth/auth-service";
import {
  rolloutFlagsmithWinner,
  updateFlagsmithCanaryStage,
  triggerFlagsmithKillSwitch,
  rollbackFlagsmithToControl,
  getLiveRemoteFeatureState,
} from "@/lib/flagsmith/flagsmith-admin";
import { recordAuditLog } from "@/lib/audit/audit-logger";
import { checkProductionRolloutGuard } from "@/lib/flagsmith/production-guards";

// Strict validation: authorizer is NOT accepted from client
const RolloutRequestSchema = z.object({
  flagsmithFeatureName: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  action: z.enum([
    "ROLLOUT_WINNER",
    "GRADUAL_STAGE",
    "ROLLBACK_TO_CONTROL",
    "EMERGENCY_KILL_SWITCH",
  ]),
  winningVariantKey: z.string().optional(),
  stagePercentage: z.number().int().min(0).max(100).optional(),
  rationale: z.string().min(5, "A descriptive rationale is required for production audit trail."),
});

function hasFlagsmithRemoteCredentials(): boolean {
  const orgToken =
    process.env.FLAGSMITH_ORG_API_TOKEN ||
    process.env.FLAGSMITH_ADMIN_TOKEN ||
    process.env.FLAGSMITH_MANAGEMENT_KEY;
  const serverKey = process.env.FLAGSMITH_SERVER_SIDE_API_KEY;
  return Boolean((orgToken && orgToken !== "mock") || (serverKey && serverKey !== "mock"));
}

export async function POST(request: Request) {
  try {
    // 1. CSRF Protection Check
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host && !origin.includes(host)) {
      return NextResponse.json(
        { success: false, error: "CSRF_DETECTED", message: "Cross-site requests are rejected." },
        { status: 403 }
      );
    }

    // 2. Extract Token from Cookie or Bearer Header
    const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const cookieHeader = request.headers.get("cookie") || "";
    const cookieToken = cookieHeader
      .split("; ")
      .find((c) => c.startsWith("pulsepilot_session="))
      ?.split("=")[1];

    const token = authHeader || cookieToken;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required for production feature flag mutations.",
        },
        { status: 401 }
      );
    }

    // 3. Server-Side Identity Verification
    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "INVALID_SESSION",
          message: "Session is invalid or has expired. Please sign in again.",
        },
        { status: 401 }
      );
    }

    // 4. Role-Based Access Control (Admin Only)
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "FORBIDDEN",
          message: "Only users with the Administrator role can execute feature flag rollouts.",
        },
        { status: 403 }
      );
    }

    // Authorizer is derived strictly from verified identity
    const verifiedAuthorizer = `${user.fullName} (${user.role} - ${user.email})`;

    // 5. Parse and Validate Request Body
    const body = await request.json();
    const req = RolloutRequestSchema.parse(body);

    const isRemoteConfigured = hasFlagsmithRemoteCredentials();
    const rolloutGuard = checkProductionRolloutGuard(isRemoteConfigured);

    if (!rolloutGuard.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: rolloutGuard.error,
          code: rolloutGuard.code,
          isConfigError: true,
        },
        { status: rolloutGuard.statusCode || 503 }
      );
    }

    // ... [Execute remote Flagsmith mutation and record verified audit log]
    // (See full implementation in STAGING_SECURITY_ROLLOUT_PLAN.md)

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: "Rollout execution rejected", details: error.message },
      { status: 400 }
    );
  }
}
```

---

## 7. Missing Dependencies & Prerequisites for Production

1. **`SESSION_SECRET` Configuration:**
   A high-entropy secret (32+ bytes) must be added to Vercel production and staging environment variables:
   ```bash
   SESSION_SECRET="generate_64_char_hex_secret_here"
   ```
2. **UI Authentication Notice:**
   Because `/api/flagsmith/rollout` strictly enforces `ADMIN` role, visitors exploring the live site who have not yet logged in will be prompted to authenticate as Sarah Lin (Product Lead) before triggering flag changes.

