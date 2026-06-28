-- AlterTable
ALTER TABLE "cobro" ADD COLUMN     "establecimientoId" TEXT;

-- AlterTable
ALTER TABLE "transaccion" ADD COLUMN     "establecimientoId" TEXT;

-- CreateTable
CREATE TABLE "establecimiento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codTienda" TEXT,
    "tipo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "establecimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "establecimiento_tenantId_codTienda_key" ON "establecimiento"("tenantId", "codTienda");

-- CreateIndex
CREATE INDEX "cobro_establecimientoId_idx" ON "cobro"("establecimientoId");

-- CreateIndex
CREATE INDEX "transaccion_establecimientoId_idx" ON "transaccion"("establecimientoId");

-- AddForeignKey
ALTER TABLE "establecimiento" ADD CONSTRAINT "establecimiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "establecimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaccion" ADD CONSTRAINT "transaccion_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "establecimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
