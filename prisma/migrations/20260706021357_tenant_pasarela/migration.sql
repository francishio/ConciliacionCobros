-- CreateEnum
CREATE TYPE "ModoIngesta" AS ENUM ('MANUAL', 'API');

-- CreateTable
CREATE TABLE "tenant_pasarela" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pasarelaCodigo" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "modo" "ModoIngesta" NOT NULL DEFAULT 'MANUAL',
    "apiCredEnc" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_pasarela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_pasarela_tenantId_pasarelaCodigo_key" ON "tenant_pasarela"("tenantId", "pasarelaCodigo");

-- AddForeignKey
ALTER TABLE "tenant_pasarela" ADD CONSTRAINT "tenant_pasarela_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (tabla tenant-scoped): aislamiento por tenant, igual que el resto.
ALTER TABLE "tenant_pasarela" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "tenant_pasarela"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
