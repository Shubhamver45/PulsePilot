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

export async function withRestrictedAppRole<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE pulsepilot_app;");
    return fn(tx);
  });
}

/**
 * Establishes a transaction-local organization context for RLS enforcement.
 * The tenant ID is passed as a parameter, never interpolated into SQL.
 */
export async function withTenantContext<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const tenantId = organizationId?.trim();
  if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED: organization ID is required.");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE pulsepilot_app;");
    await tx.$queryRawUnsafe(
      "SELECT set_config('app.current_organization_id', $1, true)",
      tenantId
    );
    return fn(tx);
  });
}
