/*
  Warnings:

  - Added the required column `tenantId` to the `liquidacion_linea` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `match` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `retencion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "liquidacion_linea" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "match" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "retencion" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "liquidacion_linea_tenantId_idx" ON "liquidacion_linea"("tenantId");

-- CreateIndex
CREATE INDEX "match_tenantId_idx" ON "match"("tenantId");

-- CreateIndex
CREATE INDEX "retencion_tenantId_idx" ON "retencion"("tenantId");

-- AddForeignKey
ALTER TABLE "liquidacion_linea" ADD CONSTRAINT "liquidacion_linea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
