-- AlterTable
ALTER TABLE "cobro" ADD COLUMN     "periodo" TEXT;

-- AlterTable
ALTER TABLE "transaccion" ADD COLUMN     "periodo" TEXT;

-- CreateIndex
CREATE INDEX "cobro_tenantId_periodo_idx" ON "cobro"("tenantId", "periodo");

-- CreateIndex
CREATE INDEX "transaccion_tenantId_periodo_idx" ON "transaccion"("tenantId", "periodo");
