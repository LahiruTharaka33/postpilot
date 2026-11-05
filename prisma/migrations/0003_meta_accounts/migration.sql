-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'MOCK';

-- CreateIndex
CREATE INDEX "SocialAccount_workspaceId_platform_externalId_idx" ON "SocialAccount"("workspaceId", "platform", "externalId");
