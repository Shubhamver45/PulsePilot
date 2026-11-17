import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Executes a database operation under the restricted least-privilege runtime role 'pulsepilot_app'.
 * Strictly enforces rolbypassrls = false at the database level.
 */
export async function withRestrictedAppRole<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE pulsepilot_app;");
    return fn(tx);
  });
}

/**
 * Executes a database operation under the restricted role 'pulsepilot_app' AND scopes the session
 * to a specific organization for multi-tenant Row Level Security (RLS) enforcement.
 */
export async function withTenantContext<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const sanitizedOrgId = organizationId.replace(/'/g, "''");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE pulsepilot_app;");
    await tx.$executeRawUnsafe(`SET LOCAL app.current_organization_id = '${sanitizedOrgId}';`);
    return fn(tx);
  });
}

