-- CreateTable
CREATE TABLE "config_hiopos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "apiUser" TEXT NOT NULL,
    "apiPasswordEnc" TEXT,
    "expIdVentas" TEXT,
    "expIdTiendas" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_hiopos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "config_hiopos_tenantId_key" ON "config_hiopos"("tenantId");

-- AddForeignKey
ALTER TABLE "config_hiopos" ADD CONSTRAINT "config_hiopos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (migrate dev no agrega la política, solo el grant vía DEFAULT PRIVILEGES).
-- Aislamiento por tenant, igual que el resto de las tablas.
ALTER TABLE "config_hiopos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "config_hiopos"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
