import { NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth/auth-service";
import { getPersistedAuditLogsForOrganization, verifyAuditLogIntegrity } from "@/lib/audit/audit-logger";

function getToken(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "");
  const cookie = (request.headers.get("cookie") || "").split("; ").find((p) => p.startsWith("pulsepilot_session="))?.split("=")[1];
  return bearer || cookie || null;
}

export async function GET(request: Request) {
  try {
    const token = getToken(request);
    const databaseConfigured = Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("mock"));
    if (!token && databaseConfigured) return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    const user = token ? await getUserFromToken(token, { checkRevocation: true, failClosed: databaseConfigured }) : null;
    if (databaseConfigured && !user) return NextResponse.json({ success: false, error: "INVALID_SESSION" }, { status: 401 });
    if (user && user.role !== "ADMIN") return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });

    const logs = await getPersistedAuditLogsForOrganization(user?.organizationId || "org_acme_growth");
    return NextResponse.json({ total: logs.length, integrity: verifyAuditLogIntegrity(logs), logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "AUDIT_LOG_READ_FAILED" }, { status: 503 });
  }
}
