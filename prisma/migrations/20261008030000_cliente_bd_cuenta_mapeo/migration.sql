-- Cliente: nº de base de datos. Cuenta de pasarela: mapeo OPCIONAL del
-- dispositivo (establecimiento / terminal) que acota la conciliación.
ALTER TABLE "tenant" ADD COLUMN "numeroBD" TEXT;

ALTER TABLE "cuenta_pasarela" ADD COLUMN "establecimientoId" TEXT;
ALTER TABLE "cuenta_pasarela" ADD COLUMN "terminal" TEXT;

-- CreateIndex
CREATE INDEX "cuenta_pasarela_establecimientoId_idx" ON "cuenta_pasarela"("establecimientoId");

-- AddForeignKey
ALTER TABLE "cuenta_pasarela" ADD CONSTRAINT "cuenta_pasarela_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "establecimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
