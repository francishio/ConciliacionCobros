-- Referencia de pasarela estampada por HIOPOS (Clover: payment id de "Datos
-- Transacción"). Clave única global → match determinístico sin scope por tienda.
ALTER TABLE "cobro" ADD COLUMN "refPasarela" TEXT;

-- CreateIndex
CREATE INDEX "cobro_tenantId_refPasarela_idx" ON "cobro"("tenantId", "refPasarela");
