-- Cobro: guardar el Cód. Medio Pago de HIOPOS (clave estable del mapeo).
ALTER TABLE "cobro" ADD COLUMN "codMedioPago" TEXT;

-- MapeoMedioPago: re-clavar por Cód. Medio Pago. Se borran los mapeos actuales
-- (test data, estaban por texto); se re-crean en la próxima ingesta.
DELETE FROM "mapeo_medio_pago";
DROP INDEX "mapeo_medio_pago_tenantId_medioPago_key";
ALTER TABLE "mapeo_medio_pago" ADD COLUMN "codMedioPago" TEXT NOT NULL DEFAULT '';
ALTER TABLE "mapeo_medio_pago" ALTER COLUMN "codMedioPago" DROP DEFAULT;
CREATE UNIQUE INDEX "mapeo_medio_pago_tenantId_codMedioPago_key" ON "mapeo_medio_pago"("tenantId", "codMedioPago");
