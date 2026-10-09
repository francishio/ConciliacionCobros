-- Dispositivos (terminales) de una cuenta de pasarela, para mapear
-- device → tienda/terminal de HIOPOS (ej. Clover /devices).

CREATE TABLE "dispositivo_pasarela" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaPasarelaId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceNombre" TEXT,
    "serial" TEXT,
    "modelo" TEXT,
    "establecimientoId" TEXT,
    "codTerminal" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivo_pasarela_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispositivo_pasarela_cuentaPasarelaId_deviceId_key" ON "dispositivo_pasarela"("cuentaPasarelaId", "deviceId");
CREATE INDEX "dispositivo_pasarela_tenantId_idx" ON "dispositivo_pasarela"("tenantId");
CREATE INDEX "dispositivo_pasarela_establecimientoId_idx" ON "dispositivo_pasarela"("establecimientoId");

ALTER TABLE "dispositivo_pasarela" ADD CONSTRAINT "dispositivo_pasarela_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispositivo_pasarela" ADD CONSTRAINT "dispositivo_pasarela_cuentaPasarelaId_fkey" FOREIGN KEY ("cuentaPasarelaId") REFERENCES "cuenta_pasarela"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispositivo_pasarela" ADD CONSTRAINT "dispositivo_pasarela_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "establecimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: aislamiento por tenant (igual que el resto de las tablas por-cliente).
ALTER TABLE "dispositivo_pasarela" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "dispositivo_pasarela"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
