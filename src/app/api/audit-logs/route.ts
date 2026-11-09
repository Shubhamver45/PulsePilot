import { NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/audit/audit-logger";

export async function GET() {
  const logs = getAuditLogs();
  return NextResponse.json({
    total: logs.length,
    logs,
  });
}

