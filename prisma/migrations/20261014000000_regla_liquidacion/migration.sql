-- Reglas de liquidación/acreditación por cliente, pasarela y tipo de cobro
-- (plazo + comisión), para proyectar el flujo de acreditaciones.

CREATE TABLE "regla_liquidacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "tipoCobro" TEXT NOT NULL,
    "plazoDias" INTEGER NOT NULL DEFAULT 0,
    "habiles" BOOLEAN NOT NULL DEFAULT false,
    "comisionPct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regla_liquidacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "regla_liquidacion_tenantId_proveedor_tipoCobro_key" ON "regla_liquidacion"("tenantId", "proveedor", "tipoCobro");
CREATE INDEX "regla_liquidacion_tenantId_idx" ON "regla_liquidacion"("tenantId");

ALTER TABLE "regla_liquidacion" ADD CONSTRAINT "regla_liquidacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: aislamiento por tenant.
ALTER TABLE "regla_liquidacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON "regla_liquidacion"
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
