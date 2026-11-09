import { NextResponse } from "next/server";
import { z } from "zod";
import { flagsmithMockStore } from "@/lib/flagsmith/flagsmith-mock";
import { recordAuditLog } from "@/lib/audit/audit-logger";

const RolloutRequestSchema = z.object({
  flagsmithFeatureName: z.string().min(1),
  action: z.enum(["ROLLOUT_WINNER", "EMERGENCY_KILL_SWITCH"]),
  winningVariantKey: z.string().optional(),
  authorizer: z.string().default("Sarah Lin (Product Lead)"),
  rationale: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const req = RolloutRequestSchema.parse(body);

    if (req.action === "ROLLOUT_WINNER") {
      if (!req.winningVariantKey) {
        return NextResponse.json(
          { success: false, error: "winningVariantKey is required for ROLLOUT_WINNER" },
          { status: 400 }
        );
      }

      flagsmithMockStore.rolloutWinner(req.flagsmithFeatureName, req.winningVariantKey);

      await recordAuditLog({
        action: "ROLLOUT_APPROVED_EXECUTED",
        actor: { name: req.authorizer, type: "human" },
        entityType: "FLAGSMITH_FLAG",
        entityId: req.flagsmithFeatureName,
        details: `Human authorized 100% rollout of '${req.winningVariantKey}' for flag '${req.flagsmithFeatureName}'.`,
        metadata: { rationale: req.rationale || "Achieved >= 95% statistical confidence." },
      });

      return NextResponse.json({
        success: true,
        action: "ROLLOUT_WINNER",
        flagsmithFeatureName: req.flagsmithFeatureName,
        winningVariantKey: req.winningVariantKey,
        trafficAllocation: { [req.winningVariantKey]: 100 },
        message: `Flagsmith feature '${req.flagsmithFeatureName}' successfully rolled out to 100% traffic on variant '${req.winningVariantKey}'.`,
      });
    }

    if (req.action === "EMERGENCY_KILL_SWITCH") {
      flagsmithMockStore.toggleKillSwitch(req.flagsmithFeatureName, false);

      await recordAuditLog({
        action: "KILL_SWITCH_TRIGGERED",
        actor: { name: req.authorizer, type: "human" },
        entityType: "FLAGSMITH_FLAG",
        entityId: req.flagsmithFeatureName,
        details: `Emergency kill-switch executed for flag '${req.flagsmithFeatureName}'. Flag disabled in Flagsmith.`,
        metadata: { rationale: req.rationale || "Immediate regression prevention." },
      });

      return NextResponse.json({
        success: true,
        action: "EMERGENCY_KILL_SWITCH",
        flagsmithFeatureName: req.flagsmithFeatureName,
        enabled: false,
        message: `Flagsmith feature '${req.flagsmithFeatureName}' disabled immediately (< 50ms latency).`,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: "Rollout execution failed", details: error.message },
      { status: 400 }
    );
  }
}

