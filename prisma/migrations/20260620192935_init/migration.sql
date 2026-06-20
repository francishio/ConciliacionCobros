-- CreateEnum
CREATE TYPE "EstadoOperativa" AS ENUM ('PENDIENTE', 'OK', 'DIFERENCIA_MONTO', 'SIN_TRANSACCION', 'EN_REVISION', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "EstadoFinanciera" AS ENUM ('PENDIENTE', 'PARCIAL', 'ACREDITADO', 'DIFERENCIA', 'CONTRACARGO', 'NO_APLICA');

-- CreateEnum
CREATE TYPE "Proveedor" AS ENUM ('MERCADOPAGO', 'PAYWAY');

-- CreateEnum
CREATE TYPE "EstadoTransaccion" AS ENUM ('APROBADA', 'ANULADA', 'DEVUELTA', 'CONTRACARGO');

-- CreateEnum
CREATE TYPE "TipoMatch" AS ENUM ('DETERMINISTICO', 'FUZZY');

-- CreateEnum
CREATE TYPE "EstadoMatch" AS ENUM ('AUTO', 'CONFIRMADO_MANUAL', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ACREDITACION', 'CONTRACARGO', 'DEVOLUCION', 'AJUSTE');

-- CreateEnum
CREATE TYPE "TipoRetencion" AS ENUM ('IVA', 'IIBB', 'GANANCIAS', 'OTRA');

-- CreateEnum
CREATE TYPE "TipoExcepcion" AS ENUM ('COBRO_SIN_TRANSACCION', 'TRANSACCION_SIN_COBRO', 'DIFERENCIA_MONTO', 'COMISION_INESPERADA', 'RETENCION_NO_ESPERADA', 'CONTRACARGO', 'CUOTA_NO_ACREDITADA', 'FUZZY_AMBIGUO');

-- CreateEnum
CREATE TYPE "EstadoExcepcion" AS ENUM ('ABIERTA', 'EN_REVISION', 'RESUELTA', 'IGNORADA');

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_profile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "determDisponible" BOOLEAN NOT NULL DEFAULT false,
    "ventanaMin" INTEGER NOT NULL DEFAULT 5,
    "tolMonto" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "matching_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hioposTicketId" TEXT NOT NULL,
    "medioPago" TEXT NOT NULL,
    "importe" DECIMAL(12,2) NOT NULL,
    "cuotas" INTEGER NOT NULL DEFAULT 1,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "codAutorizacion" TEXT,
    "ultimos4" TEXT,
    "estadoOp" "EstadoOperativa" NOT NULL DEFAULT 'PENDIENTE',
    "estadoFin" "EstadoFinanciera" NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaccion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proveedor" "Proveedor" NOT NULL,
    "idExterno" TEXT NOT NULL,
    "importeBruto" DECIMAL(12,2) NOT NULL,
    "cuotas" INTEGER NOT NULL DEFAULT 1,
    "externalReference" TEXT,
    "estado" "EstadoTransaccion" NOT NULL DEFAULT 'APROBADA',
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proveedor" "Proveedor" NOT NULL,
    "fechaAcreditacion" DATE NOT NULL,
    "netoTotal" DECIMAL(14,2) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion_linea" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "transaccionId" TEXT,
    "nroCuota" INTEGER NOT NULL DEFAULT 1,
    "bruto" DECIMAL(12,2) NOT NULL,
    "arancel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retenciones" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "neto" DECIMAL(12,2) NOT NULL,
    "tipoMov" "TipoMovimiento" NOT NULL DEFAULT 'ACREDITACION',

    CONSTRAINT "liquidacion_linea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retencion" (
    "id" TEXT NOT NULL,
    "liquidacionLineaId" TEXT NOT NULL,
    "tipo" "TipoRetencion" NOT NULL,
    "jurisdiccion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "retencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match" (
    "id" TEXT NOT NULL,
    "cobroId" TEXT NOT NULL,
    "transaccionId" TEXT NOT NULL,
    "tipo" "TipoMatch" NOT NULL,
    "score" DOUBLE PRECISION,
    "estado" "EstadoMatch" NOT NULL DEFAULT 'AUTO',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excepcion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoExcepcion" NOT NULL,
    "estado" "EstadoExcepcion" NOT NULL DEFAULT 'ABIERTA',
    "cobroId" TEXT,
    "transaccionId" TEXT,
    "nota" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excepcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "matching_profile_tenantId_key" ON "matching_profile"("tenantId");

-- CreateIndex
CREATE INDEX "cobro_tenantId_fechaHora_idx" ON "cobro"("tenantId", "fechaHora");

-- CreateIndex
CREATE INDEX "cobro_tenantId_codAutorizacion_idx" ON "cobro"("tenantId", "codAutorizacion");

-- CreateIndex
CREATE INDEX "cobro_tenantId_ultimos4_importe_idx" ON "cobro"("tenantId", "ultimos4", "importe");

-- CreateIndex
CREATE INDEX "transaccion_tenantId_fechaHora_idx" ON "transaccion"("tenantId", "fechaHora");

-- CreateIndex
CREATE UNIQUE INDEX "transaccion_tenantId_proveedor_idExterno_key" ON "transaccion"("tenantId", "proveedor", "idExterno");

-- CreateIndex
CREATE INDEX "liquidacion_tenantId_fechaAcreditacion_idx" ON "liquidacion"("tenantId", "fechaAcreditacion");

-- CreateIndex
CREATE INDEX "liquidacion_linea_transaccionId_idx" ON "liquidacion_linea"("transaccionId");

-- CreateIndex
CREATE INDEX "liquidacion_linea_liquidacionId_idx" ON "liquidacion_linea"("liquidacionId");

-- CreateIndex
CREATE INDEX "retencion_liquidacionLineaId_idx" ON "retencion"("liquidacionLineaId");

-- CreateIndex
CREATE INDEX "match_cobroId_idx" ON "match"("cobroId");

-- CreateIndex
CREATE INDEX "match_transaccionId_idx" ON "match"("transaccionId");

-- CreateIndex
CREATE INDEX "excepcion_tenantId_estado_idx" ON "excepcion"("tenantId", "estado");

-- AddForeignKey
ALTER TABLE "matching_profile" ADD CONSTRAINT "matching_profile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaccion" ADD CONSTRAINT "transaccion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion" ADD CONSTRAINT "liquidacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_linea" ADD CONSTRAINT "liquidacion_linea_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_linea" ADD CONSTRAINT "liquidacion_linea_transaccionId_fkey" FOREIGN KEY ("transaccionId") REFERENCES "transaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retencion" ADD CONSTRAINT "retencion_liquidacionLineaId_fkey" FOREIGN KEY ("liquidacionLineaId") REFERENCES "liquidacion_linea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_transaccionId_fkey" FOREIGN KEY ("transaccionId") REFERENCES "transaccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepcion" ADD CONSTRAINT "excepcion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepcion" ADD CONSTRAINT "excepcion_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "cobro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepcion" ADD CONSTRAINT "excepcion_transaccionId_fkey" FOREIGN KEY ("transaccionId") REFERENCES "transaccion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
