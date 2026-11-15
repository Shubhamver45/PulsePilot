import { NextResponse } from "next/server";
import { getAuditLogs, verifyAuditLogIntegrity } from "@/lib/audit/audit-logger";

export async function GET() {
  const logs = getAuditLogs();
  const integrity = verifyAuditLogIntegrity(logs);
  return NextResponse.json({
    total: logs.length,
    integrity,
    logs,
  });
}
