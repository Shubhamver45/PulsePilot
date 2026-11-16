import { NextResponse } from "next/server";
import { getPersistedAuditLogs, verifyAuditLogIntegrity } from "@/lib/audit/audit-logger";

export async function GET() {
  const logs = await getPersistedAuditLogs();
  const integrity = verifyAuditLogIntegrity(logs);
  return NextResponse.json({
    total: logs.length,
    integrity,
    logs,
  });
}
