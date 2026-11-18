import { NextResponse } from "next/server";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import { evaluateBetaTesterSegment } from "@/lib/flagsmith/flagsmith-admin";
import { getFlagsmithIdentityAssignment } from "@/lib/flagsmith/identity-evaluation";
import { checkProductionEvaluationGuard } from "@/lib/flagsmith/production-guards";
import { getAuthenticatedApplicationUser } from "@/lib/auth/server-auth";
import { canEvaluateFlagsmithIdentity, isPublicDemoIdentity } from "@/lib/telemetry/public-demo-identity";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const flag = searchParams.get("flag") || "exp_checkout_layout_v2";
  const identity = searchParams.get("identity") || "user_alex_dev";
  const user = await getAuthenticatedApplicationUser(request);
  const targetBelongsToWorkspace = Boolean(
    user?.role === "ADMIN" &&
    identity !== user.id &&
    !isPublicDemoIdentity(identity) &&
    await prisma.user.findFirst({
      where: { id: identity, organizationId: user.organizationId },
      select: { id: true },
    })
  );

  if (!canEvaluateFlagsmithIdentity(user, identity, targetBelongsToWorkspace)) {
    return NextResponse.json({
      error: user ? "IDENTITY_ACCESS_DENIED" : "AUTHENTICATION_REQUIRED",
      message: user
        ? "You can evaluate your own identity, public demo personas, or workspace members when you are an administrator."
        :¶»§q«^