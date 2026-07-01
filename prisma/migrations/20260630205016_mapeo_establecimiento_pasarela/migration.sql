-- CreateTable
CREATE TABLE "mapeo_establecimiento_pasarela" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "establecimientoId" TEXT NOT NULL,
    "proveedor" "Proveedor" NOT NULL,
    "codigoExterno" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mapeo_establecimiento_pasarela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mapeo_establecimiento_pasarela_establecimientoId_idx" ON "mapeo_establecimiento_pasarela"("establecimientoId");

-- CreateIndex
CREATE UNIQUE INDEX "mapeo_establecimiento_pasarela_tenantId_proveedor_codigoExt_key" ON "mapeo_establecimiento_pasarela"("tenantId", "proveedor", "codigoExterno");

-- AddForeignKey
ALTER TABLE "mapeo_establecimiento_pasarela" ADD CONSTRAINT "mapeo_establecimiento_pasarela_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapeo_establecimiento_pasarela" ADD CONSTRAINT "mapeo_establecimiento_pasarela_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "establecimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (migrate dev no agrega la política, solo el grant vía DEFAULT PRIVILEGES).
-- Aislamiento por tenant, igual que el resto de las tablas.
ALTER TABLE "mapeo_establecimiento_pasarela" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "mapeo_establecimiento_pasarela"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
