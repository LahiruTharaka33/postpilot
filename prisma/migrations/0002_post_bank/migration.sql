-- CreateTable
CREATE TABLE "BankPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "baseCaption" TEXT NOT NULL,
    "mediaIds" TEXT NOT NULL DEFAULT '[]',
    "accountIds" TEXT NOT NULL DEFAULT '[]',
    "custom" TEXT NOT NULL DEFAULT '{}',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankPost_workspaceId_updatedAt_idx" ON "BankPost"("workspaceId", "updatedAt");

-- AddForeignKey
ALTER TABLE "BankPost" ADD CONSTRAINT "BankPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankPost" ADD CONSTRAINT "BankPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

