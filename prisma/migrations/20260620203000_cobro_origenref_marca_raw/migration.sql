-- AlterTable: Cobro gana origenRef (idempotencia), marca y raw
ALTER TABLE "cobro"
  ADD COLUMN "marca" TEXT,
  ADD COLUMN "origenRef" TEXT NOT NULL,
  ADD COLUMN "raw" JSONB;

-- AlterTable: Transaccion gana marca (para matching fuzzy)
ALTER TABLE "transaccion" ADD COLUMN "marca" TEXT;

-- CreateIndex: idempotencia de ingesta de cobros
CREATE UNIQUE INDEX "cobro_tenantId_origenRef_key" ON "cobro"("tenantId", "origenRef");
