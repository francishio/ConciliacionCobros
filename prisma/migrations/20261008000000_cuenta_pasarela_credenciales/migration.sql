-- Credenciales de pasarela por cliente (lugar único) + 1 solo Exportation ID.
-- Mueve la credencial fuera del mapeo por establecimiento a una cuenta por
-- cliente (una fila por comercio/cuenta; Clover usa token por-MID).

-- CreateTable
CREATE TABLE "cuenta_pasarela" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modo" "ModoIngesta" NOT NULL DEFAULT 'API',
    "identificador" TEXT NOT NULL DEFAULT '',
    "credencialEnc" TEXT,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuenta_pasarela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_pasarela_tenantId_proveedor_identificador_key" ON "cuenta_pasarela"("tenantId", "proveedor", "identificador");

-- AddForeignKey
ALTER TABLE "cuenta_pasarela" ADD CONSTRAINT "cuenta_pasarela_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mapeo por establecimiento: la credencial sale de acá, ahora apunta a una cuenta.
ALTER TABLE "mapeo_establecimiento_pasarela" DROP COLUMN "apiCredEnc";
ALTER TABLE "mapeo_establecimiento_pasarela" ADD COLUMN "cuentaPasarelaId" TEXT;

-- CreateIndex
CREATE INDEX "mapeo_establecimiento_pasarela_cuentaPasarelaId_idx" ON "mapeo_establecimiento_pasarela"("cuentaPasarelaId");

-- AddForeignKey
ALTER TABLE "mapeo_establecimiento_pasarela" ADD CONSTRAINT "mapeo_establecimiento_pasarela_cuentaPasarelaId_fkey" FOREIGN KEY ("cuentaPasarelaId") REFERENCES "cuenta_pasarela"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Config HIOPOS: un solo Exportation ID (se va el de Tiendas).
ALTER TABLE "config_hiopos" DROP COLUMN "expIdTiendas";

-- RLS para cuenta_pasarela (aislamiento por tenant, igual que el resto).
ALTER TABLE "cuenta_pasarela" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "cuenta_pasarela"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
