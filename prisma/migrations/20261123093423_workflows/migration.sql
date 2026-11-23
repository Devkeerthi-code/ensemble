-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "trigger" VARCHAR(20) NOT NULL DEFAULT 'manual',
ADD COLUMN     "workflowId" TEXT;

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "template" VARCHAR(40),
    "title" VARCHAR(200) NOT NULL,
    "criteria" VARCHAR(2000) NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "preference" "Preference" NOT NULL DEFAULT 'quality',
    "budgetUsd" DECIMAL(10,4) NOT NULL,
    "plan" JSONB NOT NULL,
    "inputs" JSONB,
    "schedule" VARCHAR(60),
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "webhookTokenHash" VARCHAR(64),
    "deliveryUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_webhookTokenHash_key" ON "Workflow"("webhookTokenHash");

-- CreateIndex
CREATE INDEX "Workflow_userId_updatedAt_idx" ON "Workflow"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Workflow_enabled_nextRunAt_idx" ON "Workflow"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "Run_workflowId_createdAt_idx" ON "Run"("workflowId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

