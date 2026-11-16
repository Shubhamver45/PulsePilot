-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RUNNING', 'PAUSED', 'CONCLUDED_ROLLED_OUT', 'CONCLUDED_ROLLED_BACK');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('EXPOSURE', 'CONVERSION');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('CONVERSION_RATE', 'CLICK_THROUGH', 'REVENUE', 'RETENTION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('HYPOTHESIS_ARCHITECT', 'STATISTICAL_ANALYST', 'ROLLOUT_STRATEGIST', 'GUARDRAIL_SENTINEL', 'FUNNEL_TELEMETRY_TRACKER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('EXPERIMENT_CREATED', 'EXPERIMENT_APPROVED', 'FLAG_ACTIVATED', 'TRAFFIC_SPLIT_UPDATED', 'GRADUAL_STAGE_UPDATED', 'GRADUAL_STAGE_FAILED', 'ROLLOUT_RECOMMENDED', 'ROLLOUT_APPROVED', 'ROLLOUT_APPROVED_EXECUTED', 'ROLLOUT_FAILED', 'ROLLBACK_PERFORMED', 'ROLLBACK_EXECUTED', 'ROLLBACK_FAILED', 'KILL_SWITCH_TRIGGERED', 'KILL_SWITCH_FAILED', 'OPERATION_FAILED', 'CONVERSION_RECORDED', 'EXPERIMENT_COMPLETED', 'ANALYSIS_GENERATED', 'IDENTITY_TRAITS_UPDATED', 'SEGMENT_CREATED', 'SEGMENT_TARGETING_EVALUATED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL,
    "flagsmithProjectId" TEXT,
    "flagsmithEnvironmentKey" TEXT,
    "flagsmithServerKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "description" TEXT,
    "targetAudience" TEXT,
    "flagsmithFeatureId" INTEGER,
    "flagsmithFeatureName" TEXT NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'ACTIVE',
    "primaryMetric" TEXT NOT NULL,
    "guardrailMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sampleSizeTarget" INTEGER NOT NULL DEFAULT 5000,
    "sampleSizeCurrent" INTEGER NOT NULL DEFAULT 0,
    "winningVariantId" TEXT,
    "rolloutRationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_variants" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "trafficAllocation" INTEGER NOT NULL DEFAULT 50,
    "featureValue" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiment_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "type" "MetricType" NOT NULL DEFAULT 'CONVERSION_RATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_events" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "distinctUserId" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "metricKey" TEXT,
    "dedupKey" TEXT,
    "properties" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT,
    "userId" TEXT,
    "agentType" "AgentType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "rawResponse" TEXT,
    "structuredOutput" JSONB NOT NULL,
    "tokensUsed" INTEGER,
    "modelName" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "experimentId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorName" TEXT,
    "actorType" TEXT,
    "details" TEXT,
    "signature" TEXT,
    "previousSignature" TEXT,
    "sequenceNumber" INTEGER,
    "previousState" JSONB,
    "newState" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "projects_organizationId_idx" ON "projects"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "experiments_flagsmithFeatureName_key" ON "experiments"("flagsmithFeatureName");

-- CreateIndex
CREATE INDEX "experiments_projectId_status_idx" ON "experiments"("projectId", "status");

-- CreateIndex
CREATE INDEX "experiment_variants_experimentId_idx" ON "experiment_variants"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_variants_experimentId_key_key" ON "experiment_variants"("experimentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "metrics_projectId_key_key" ON "metrics"("projectId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_events_dedupKey_key" ON "telemetry_events"("dedupKey");

-- CreateIndex
CREATE INDEX "telemetry_events_experimentId_variantId_eventType_idx" ON "telemetry_events"("experimentId", "variantId", "eventType");

-- CreateIndex
CREATE INDEX "telemetry_events_experimentId_timestamp_idx" ON "telemetry_events"("experimentId", "timestamp");

-- CreateIndex
CREATE INDEX "agent_runs_experimentId_idx" ON "agent_runs"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_signature_key" ON "audit_logs"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_sequenceNumber_key" ON "audit_logs"("sequenceNumber");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "experiment_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

