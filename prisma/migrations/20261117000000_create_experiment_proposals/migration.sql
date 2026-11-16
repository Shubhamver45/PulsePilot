-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'EXECUTED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "experiment_proposals" (
    "id" TEXT NOT NULL,
    "configuration_hash" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "target_environment" TEXT NOT NULL DEFAULT 'development',
    "flagsmith_feature_name" TEXT NOT NULL,
    "strategy" JSONB NOT NULL,
    "duplicate_check" JSONB NOT NULL,
    "validation" JSONB NOT NULL,
    "instrumentation_plan" JSONB NOT NULL,
    "proposed_by" TEXT NOT NULL,
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "executed_by" TEXT,
    "executed_at" TIMESTAMP(3),
    "execution_result" JSONB,
    "idempotency_key" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "remote_feature_id" INTEGER,
    "execution_step" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiment_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiment_proposals_status_expires_at_idx" ON "experiment_proposals"("status", "expires_at");

-- CreateIndex
CREATE INDEX "experiment_proposals_idempotency_key_idx" ON "experiment_proposals"("idempotency_key");

-- CreateIndex
CREATE INDEX "experiment_proposals_flagsmith_feature_name_idx" ON "experiment_proposals"("flagsmith_feature_name");
