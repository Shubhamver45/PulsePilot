import { NextResponse } from "next/server";
import { getPersistedAuditLogs, verifyPersistedAuditLogIntegrity } from "@/lib/audit/audit-logger";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";

export async function GET(request: Request) {
  const user = await getAuthenticatedApplicationUser(request);
  if (!user) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  try {
    const [logs, integrity] = await Promise.all([
      getPersistedAuditLogs(user.organizationId),
      // The cryptographic chain is global and sequence-numbered; return only
      // the integrity result, never the other organizations' records.
      verifyPersistedAuditLogIntegrity(),
    ]);

    return NextResponse.json({
      total: logs.length,
      integrity,
      logs,
    });
  } catch (error: any) {
    console.error("[Audit API] Failed to read audit trail:", error?.message || error);
    return NextResponse.json({ error: "AUDIT_LOG_UNAVAILABLE" }, { status: 503 });
  }
}
