/*
  Warnings:

  - You are about to drop the column `app_secret` on the `applications` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BlacklistRule" ALTER COLUMN "kind" SET DEFAULT 'BLACKLIST';

-- AlterTable
ALTER TABLE "applications" DROP COLUMN "app_secret";

-- CreateIndex
CREATE INDEX "BlacklistRule_active_kind_idx" ON "BlacklistRule"("active", "kind");

-- CreateIndex
CREATE INDEX "BlacklistRule_appId_active_idx" ON "BlacklistRule"("appId", "active");
