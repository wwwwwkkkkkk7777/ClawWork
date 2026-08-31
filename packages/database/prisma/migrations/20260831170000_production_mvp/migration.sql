-- Formal password credentials, durable queue metadata, and S3 object metadata.
ALTER TABLE "Task"
ADD COLUMN "queueJobId" TEXT,
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "File"
ALTER COLUMN "contentPath" DROP NOT NULL,
ADD COLUMN "etag" TEXT;

CREATE TABLE "PasswordCredential" (
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "Task_queueJobId_key" ON "Task"("queueJobId");

ALTER TABLE "PasswordCredential"
ADD CONSTRAINT "PasswordCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
