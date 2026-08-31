/*
  Warnings:

  Existing skeleton records are backfilled before the new required columns are
  made non-null so this migration is safe on an already-used development DB.

*/
-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_userId_fkey";

-- DropForeignKey
ALTER TABLE "TaskResult" DROP CONSTRAINT "TaskResult_taskId_fkey";

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3);
UPDATE "RefreshToken" SET "expiresAt" = "createdAt" + INTERVAL '30 days';
ALTER TABLE "RefreshToken" ALTER COLUMN "expiresAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "inputText" TEXT,
ADD COLUMN     "parentTaskId" TEXT,
ADD COLUMN     "preferredLength" TEXT,
ADD COLUMN     "preferredTone" TEXT,
ADD COLUMN     "runId" TEXT,
ADD COLUMN     "adapterStreamUrl" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "Task" SET
  "inputText" = '',
  "preferredLength" = 'medium',
  "preferredTone" = 'default',
  "updatedAt" = "createdAt";
ALTER TABLE "Task" ALTER COLUMN "inputText" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "preferredLength" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "preferredTone" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "updatedAt" TIMESTAMP(3);
UPDATE "User" SET "updatedAt" = "createdAt";
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Existing skeleton results are linked to their task session before enforcing
-- the new per-session version uniqueness rule.
ALTER TABLE "TaskResult" ADD COLUMN "sessionId" TEXT;
UPDATE "TaskResult" AS result
SET "sessionId" = task."sessionId"
FROM "Task" AS task
WHERE result."taskId" = task."id";
ALTER TABLE "TaskResult" ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "preferredTone" TEXT NOT NULL DEFAULT 'balanced',
    "preferredLength" TEXT NOT NULL DEFAULT 'standard',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFile" (
    "taskId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "TaskFile_pkey" PRIMARY KEY ("taskId","fileId")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" SERIAL NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "File_storageKey_key" ON "File"("storageKey");

-- CreateIndex
CREATE INDEX "File_userId_createdAt_idx" ON "File"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_id_idx" ON "TaskEvent"("taskId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEvent_taskId_sourceEventId_key" ON "TaskEvent"("taskId", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskResult_sessionId_versionNo_key" ON "TaskResult"("sessionId", "versionNo");

-- CreateIndex
CREATE INDEX "TaskResult_sessionId_createdAt_idx" ON "TaskResult"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AppSession_userId_updatedAt_idx" ON "AppSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_sessionId_createdAt_idx" ON "Task"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AppSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskResult" ADD CONSTRAINT "TaskResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskResult" ADD CONSTRAINT "TaskResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AppSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFile" ADD CONSTRAINT "TaskFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
