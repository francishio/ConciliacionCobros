-- AlterTable
ALTER TABLE "transaccion" ADD COLUMN     "codAutorizacion" TEXT;

-- CreateIndex
CREATE INDEX "transaccion_tenantId_codAutorizacion_idx" ON "transaccion"("tenantId", "codAutorizacion");
